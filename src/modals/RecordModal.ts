import { App, Modal, TFile, Component, MarkdownRenderer, setIcon } from "obsidian";
import { DatabaseRecord, TypedValue, formatTypedValue, PropertyType } from "../database/schema";
import { updateRecordRaw, wrapContentWithCodeBlockIfNeeded } from "../database/writer";
import { parseFile, flattenRecords } from "../database/parser";
import type { PropertyConfig } from "../settings";

interface EditableProperty {
    key: string;
    type: PropertyType;
    value: string;
}

interface RecordNavigationItem {
    title: string;
    content: string;
    propertiesSignature: string;
    lineStart: number;
}

const TAG_COLORS = [
    "var(--tag-color-1)",
    "var(--tag-color-2)",
    "var(--tag-color-3)",
    "var(--tag-color-4)",
    "var(--tag-color-5)",
    "var(--tag-color-6)",
    "var(--tag-color-7)",
    "var(--tag-color-8)",
];

function getTagColor(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export class RecordModal extends Modal {
    record: DatabaseRecord;
    file: TFile;
    component: Component;
    globalProperties: PropertyConfig[];
    navigationItems: RecordNavigationItem[];
    currentIndex: number;
    originalBlock: string = "";
    titleValue: string = "";
    contentValue: string = "";
    propertiesValue: EditableProperty[] = [];
    previewContainer: HTMLElement | null = null;
    contentSection: HTMLElement | null = null;
    isEditingContent: boolean = false;
    suggestionMap: Record<string, string[]> = {};
    private readonly keydownHandler: (event: KeyboardEvent) => void;

    constructor(
        app: App,
        file: TFile,
        record: DatabaseRecord,
        globalProperties: PropertyConfig[] = [],
        navigationRecords: DatabaseRecord[] = [record],
        currentIndex: number = 0
    ) {
        super(app);
        this.record = record;
        this.file = file;
        this.component = new Component();
        this.globalProperties = globalProperties;
        this.navigationItems = navigationRecords.map((item) => this.createNavigationItem(item));
        this.currentIndex = Math.max(0, Math.min(currentIndex, this.navigationItems.length - 1));
        this.keydownHandler = (event: KeyboardEvent) => {
            void this.handleNavigationKeydown(event);
        };
    }

    private isEditableTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    }

    private async handleNavigationKeydown(event: KeyboardEvent) {
        if (!this.modalEl.hasClass("markdown-db-record-modal-shell")) {
            return;
        }

        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
        }

        if (this.isEditableTarget(event.target)) {
            return;
        }

        if (event.key === "ArrowLeft") {
            event.preventDefault();
            await this.navigateToRecord(this.currentIndex - 1);
            return;
        }

        if (event.key === "ArrowRight") {
            event.preventDefault();
            await this.navigateToRecord(this.currentIndex + 1);
        }
    }

    private createNavigationItem(record: DatabaseRecord): RecordNavigationItem {
        return {
            title: record.title,
            content: record.content || "",
            propertiesSignature: JSON.stringify(record.properties),
            lineStart: record.lineStart
        };
    }

    private buildCurrentPropertiesSignature(): string {
        const properties: Record<string, TypedValue[]> = {};

        this.propertiesValue.forEach((property) => {
            const trimmedValue = property.value.trim();
            if (!trimmedValue) {
                return;
            }

            const typedValue: TypedValue = {
                type: property.type,
                value: property.type === "multi"
                    ? trimmedValue.split(",").map((item) => item.trim()).filter(Boolean)
                    : property.type === "boolean"
                        ? trimmedValue === "true"
                        : trimmedValue
            };

            if (!properties[property.key]) {
                properties[property.key] = [];
            }

            properties[property.key].push(typedValue);
        });

        return JSON.stringify(properties);
    }

    private findMatchingRecord(records: DatabaseRecord[], item: RecordNavigationItem, fallbackIndex: number): DatabaseRecord | null {
        const exactLineMatch = records.find((record) => record.lineStart === item.lineStart && record.title === item.title);
        if (exactLineMatch) {
            return exactLineMatch;
        }

        const exactContentMatch = records.find((record) =>
            record.title === item.title &&
            (record.content || "") === item.content &&
            JSON.stringify(record.properties) === item.propertiesSignature
        );
        if (exactContentMatch) {
            return exactContentMatch;
        }

        const titleAndContentMatch = records.find((record) =>
            record.title === item.title &&
            (record.content || "") === item.content
        );
        if (titleAndContentMatch) {
            return titleAndContentMatch;
        }

        return records[fallbackIndex] ?? null;
    }

    private async loadRecordState(record: DatabaseRecord) {
        this.record = record;

        const fileContent = await this.app.vault.read(this.file);
        const lines = fileContent.split(/\r?\n/);
        const recordLines = lines.slice(this.record.lineStart, this.record.lineEnd + 1);
        this.originalBlock = recordLines.join("\n").replace(/\s+$/, "");
        this.titleValue = this.record.title;
        this.contentValue = this.record.content?.replace(/^\n+/, "") || "";
        this.propertiesValue = this.buildEditableProperties();
        this.suggestionMap = this.buildSuggestionMap(fileContent);
        this.isEditingContent = false;
        this.previewContainer = null;
        this.contentSection = null;
    }

    private async saveCurrentRecord() {
        const nextBlock = this.buildRecordBlock().replace(/\s+$/, "");
        if (nextBlock !== this.originalBlock) {
            await updateRecordRaw(this.app, this.file, this.record, nextBlock);
            this.originalBlock = nextBlock;
        }

        this.navigationItems[this.currentIndex] = {
            title: this.titleValue.trim() || "Untitled",
            content: this.contentValue,
            propertiesSignature: this.buildCurrentPropertiesSignature(),
            lineStart: this.record.lineStart
        };
    }

    private async navigateToRecord(nextIndex: number) {
        if (nextIndex < 0 || nextIndex >= this.navigationItems.length || nextIndex === this.currentIndex) {
            return;
        }

        await this.saveCurrentRecord();

        const fileContent = await this.app.vault.read(this.file);
        const parsed = parseFile(fileContent);
        const allRecords = flattenRecords(parsed.records);
        const targetItem = this.navigationItems[nextIndex];
        const nextRecord = this.findMatchingRecord(allRecords, targetItem, nextIndex);

        if (!nextRecord) {
            return;
        }

        this.navigationItems = this.navigationItems.map((item, index) => {
            const refreshed = this.findMatchingRecord(allRecords, item, index);
            return refreshed ? this.createNavigationItem(refreshed) : item;
        });

        this.currentIndex = nextIndex;
        await this.loadRecordState(nextRecord);
        await this.renderModalContent();
    }

    private buildEditableProperties(): EditableProperty[] {
        return Object.entries(this.record.properties).flatMap(([key, values]) => {
            return values.map((typedValue) => ({
                key,
                type: typedValue.type,
                value: this.getEditableValue(typedValue)
            }));
        });
    }

    private getEditableValue(typedValue: TypedValue): string {
        if (typedValue.type === "multi") {
            return Array.isArray(typedValue.value) ? typedValue.value.join(", ") : String(typedValue.value ?? "");
        }
        return String(typedValue.value ?? "");
    }

    private buildRecordBlock(): string {
        const headingPrefix = "#".repeat(this.record.level + 1);
        const lines: string[] = [`${headingPrefix} ${this.titleValue.trim() || "Untitled"}`];

        const propertyLines = this.propertiesValue
            .map((property) => {
                const trimmedValue = property.value.trim();
                if (!trimmedValue) return null;

                const typedValue: TypedValue = {
                    type: property.type,
                    value: property.type === "multi"
                        ? trimmedValue.split(",").map((item) => item.trim()).filter(Boolean)
                        : property.type === "boolean"
                            ? trimmedValue === "true"
                        : trimmedValue
                };

                return `[${property.key}::${formatTypedValue(typedValue)}]`;
            })
            .filter((line): line is string => Boolean(line));

        if (propertyLines.length > 0) {
            lines.push("%%", ...propertyLines, "%%");
        }

        const trimmedContent = this.contentValue.replace(/\s+$/, "");
        if (trimmedContent) {
            lines.push("", wrapContentWithCodeBlockIfNeeded(trimmedContent));
        }

        return lines.join("\n");
    }

    private buildSuggestionMap(fileContent: string): Record<string, string[]> {
        const dbData = parseFile(fileContent);
        const map: Record<string, string[]> = {};

        const addValue = (key: string, rawValue: unknown) => {
            if (rawValue === null || rawValue === undefined) return;
            const value = String(rawValue).trim();
            if (!value) return;
            if (!map[key]) map[key] = [];
            map[key].push(value);
        };

        flattenRecords(dbData.records).forEach((record) => {
            Object.entries(record.properties).forEach(([key, values]) => {
                values.forEach((typedValue) => {
                    if (typedValue.type === "multi") {
                        const items = Array.isArray(typedValue.value)
                            ? typedValue.value
                            : String(typedValue.value).split(",").map((item) => item.trim()).filter(Boolean);
                        items.forEach((item) => addValue(key, item));
                    } else {
                        addValue(key, typedValue.value);
                    }
                });
            });
        });

        this.globalProperties.forEach((property) => {
            if (!map[property.name]) {
                map[property.name] = [];
            }
            property.values.forEach((value) => addValue(property.name, value));
        });

        Object.keys(map).forEach((key) => {
            map[key] = Array.from(new Set(map[key]));
        });

        return map;
    }

    private renderPropertyTags(container: HTMLElement, property: EditableProperty) {
        container.empty();
        const values = property.type === "multi"
            ? property.value.split(",").map((item) => item.trim()).filter(Boolean)
            : (property.value.trim() ? [property.value.trim()] : []);

        values.forEach((value) => {
            const tag = container.createSpan({
                cls: "markdown-db-record-property-tag",
                text: value
            });
            tag.style.backgroundColor = getTagColor(value);
        });
    }

    private createTagPropertyInput(field: HTMLElement, property: EditableProperty, index: number, suggestions: string[]) {
        let draftValue = "";
        let highlightedIndex = 0;

        const editor = field.createDiv({ cls: "markdown-db-record-tag-editor" });
        const tagsContainer = editor.createDiv({ cls: "markdown-db-record-tag-editor-tags" });
        const input = editor.createEl("input", {
            type: "text",
            cls: "markdown-db-record-tag-editor-input",
            placeholder: property.type === "select" ? "Choose or type a value" : "Add option..."
        });
        const suggestionsEl = field.createDiv({ cls: "markdown-db-record-tag-suggestions" });
        suggestionsEl.style.display = "none";

        const getValues = () => {
            return property.type === "multi"
                ? property.value.split(",").map((item) => item.trim()).filter(Boolean)
                : (property.value.trim() ? [property.value.trim()] : []);
        };

        const setValues = (values: string[]) => {
            this.propertiesValue[index].value = values.join(", ");
            property.value = this.propertiesValue[index].value;
            renderTags();
            renderSuggestions();
        };

        const addValue = (value: string) => {
            const trimmed = value.trim();
            if (!trimmed) return;

            if (property.type === "select") {
                setValues([trimmed]);
            } else {
                const current = getValues();
                if (current.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                    input.value = "";
                    draftValue = "";
                    renderSuggestions();
                    return;
                }
                setValues([...current, trimmed]);
            }

            input.value = "";
            draftValue = "";
            input.focus();
        };

        const removeValue = (value: string) => {
            const remaining = getValues().filter((item) => item !== value);
            setValues(remaining);
            input.focus();
        };

        const getFilteredSuggestions = () => {
            const currentValues = new Set(getValues().map((item) => item.toLowerCase()));
            return suggestions.filter((suggestion) => {
                if (currentValues.has(suggestion.toLowerCase())) return false;
                if (!draftValue.trim()) return true;
                return suggestion.toLowerCase().includes(draftValue.trim().toLowerCase());
            });
        };

        const renderTags = () => {
            tagsContainer.empty();
            getValues().forEach((value) => {
                const tag = tagsContainer.createSpan({ cls: "markdown-db-record-tag-editor-tag" });
                tag.style.backgroundColor = getTagColor(value);
                tag.createSpan({ text: value });

                const remove = tag.createSpan({ cls: "markdown-db-record-tag-editor-tag-remove", text: "x" });
                remove.onmousedown = (e) => e.preventDefault();
                remove.onclick = (e) => {
                    e.stopPropagation();
                    removeValue(value);
                };
            });
        };

        const renderSuggestions = () => {
            const filtered = getFilteredSuggestions();
            suggestionsEl.empty();

            if (filtered.length === 0 || document.activeElement !== input) {
                suggestionsEl.style.display = "none";
                return;
            }

            highlightedIndex = Math.max(0, Math.min(highlightedIndex, filtered.length - 1));
            suggestionsEl.style.display = "block";

            filtered.forEach((suggestion, suggestionIndex) => {
                const item = suggestionsEl.createDiv({
                    cls: "markdown-db-record-tag-suggestion-item"
                });
                if (suggestionIndex === highlightedIndex) {
                    item.addClass("is-selected");
                }
                item.createSpan({ text: suggestion });
                item.onmouseenter = () => {
                    highlightedIndex = suggestionIndex;
                    renderSuggestions();
                };
                item.onmousedown = (e) => {
                    e.preventDefault();
                    addValue(suggestion);
                };
            });
        };

        input.onfocus = () => {
            renderSuggestions();
        };

        input.oninput = (e) => {
            draftValue = (e.target as HTMLInputElement).value;
            highlightedIndex = 0;
            renderSuggestions();
        };

        input.onkeydown = (e) => {
            const filtered = getFilteredSuggestions();

            if (e.key === "ArrowDown" && filtered.length > 0) {
                e.preventDefault();
                highlightedIndex = (highlightedIndex + 1) % filtered.length;
                renderSuggestions();
                return;
            }

            if (e.key === "ArrowUp" && filtered.length > 0) {
                e.preventDefault();
                highlightedIndex = (highlightedIndex - 1 + filtered.length) % filtered.length;
                renderSuggestions();
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                if (filtered.length > 0 && draftValue.trim()) {
                    addValue(filtered[highlightedIndex] || draftValue);
                } else {
                    addValue(draftValue);
                }
                return;
            }

            if (e.key === "Backspace" && !draftValue && property.type === "multi") {
                const values = getValues();
                if (values.length > 0) {
                    removeValue(values[values.length - 1]);
                }
                return;
            }

            if (e.key === "Escape") {
                suggestionsEl.style.display = "none";
            }
        };

        input.onblur = () => {
            window.setTimeout(() => {
                if (!editor.contains(document.activeElement) && !suggestionsEl.contains(document.activeElement)) {
                    suggestionsEl.style.display = "none";
                }
            }, 150);
        };

        renderTags();
        renderSuggestions();
    }

    private createPropertyInput(field: HTMLElement, property: EditableProperty, index: number) {
        const suggestions = this.suggestionMap[property.key] || [];

        if (property.type === "boolean") {
            const toggle = field.createEl("input", {
                type: "checkbox",
                cls: "markdown-db-record-property-checkbox"
            });
            toggle.checked = property.value === "true";
            toggle.onchange = (e) => {
                this.propertiesValue[index].value = (e.target as HTMLInputElement).checked ? "true" : "false";
            };
            return;
        }

        if (property.type === "date") {
            const input = field.createEl("input", {
                type: "date",
                cls: "markdown-db-record-property-input",
                value: property.value
            });
            input.oninput = (e) => {
                this.propertiesValue[index].value = (e.target as HTMLInputElement).value;
            };
            return;
        }

        const input = field.createEl("input", {
            type: property.type === "number" ? "number" : property.type === "link" ? "url" : "text",
            cls: "markdown-db-record-property-input",
            value: property.value,
            placeholder: property.type === "multi" ? "value1, value2" : "Value"
        });

        if (property.type === "select" || property.type === "multi") {
            input.remove();
            this.createTagPropertyInput(field, property, index, suggestions);
            return;
        }

        input.oninput = (e) => {
            this.propertiesValue[index].value = (e.target as HTMLInputElement).value;
        };
    }

    private async renderPreview() {
        if (!this.previewContainer) return;

        this.previewContainer.empty();

        if (!this.contentValue.trim()) {
            this.previewContainer.setText("Empty content. Click to edit...");
            this.previewContainer.style.color = "var(--text-faint)";
            return;
        }

        this.previewContainer.style.color = "";
        await MarkdownRenderer.render(
            this.app,
            this.contentValue,
            this.previewContainer,
            this.file.path,
            this.component
        );
    }

    private async renderContentSection() {
        if (!this.contentSection) return;

        this.contentSection.empty();
        this.contentSection.createEl("h4", { text: "Content" });

        if (this.isEditingContent) {
            const contentTextarea = this.contentSection.createEl("textarea", {
                cls: "markdown-db-record-content-textarea",
                text: this.contentValue,
                placeholder: "Type content..."
            });

            contentTextarea.focus();
            contentTextarea.selectionStart = contentTextarea.value.length;
            contentTextarea.selectionEnd = contentTextarea.value.length;

            contentTextarea.oninput = (e) => {
                this.contentValue = (e.target as HTMLTextAreaElement).value;
            };

            contentTextarea.onblur = async () => {
                this.isEditingContent = false;
                await this.renderContentSection();
            };

            return;
        }

        this.previewContainer = this.contentSection.createDiv({ cls: "markdown-db-record-preview" });
        this.previewContainer.onclick = async (e) => {
            if (e.target instanceof HTMLAnchorElement) return;
            this.isEditingContent = true;
            await this.renderContentSection();
        };
        await this.renderPreview();
    }

    private async renderModalContent() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.classList.add("markdown-db-record-modal");

        const container = contentEl.createDiv({ cls: "markdown-db-record-modal-container" });
        const header = container.createDiv({ cls: "markdown-db-record-header" });

        const prevButton = header.createEl("button", {
            cls: "markdown-db-record-nav-button"
        });
        prevButton.type = "button";
        prevButton.disabled = this.currentIndex === 0;
        prevButton.setAttr("aria-label", "Previous record");
        setIcon(prevButton, "chevron-left");
        prevButton.onclick = async () => {
            await this.navigateToRecord(this.currentIndex - 1);
        };

        const titleInput = header.createEl("input", {
            type: "text",
            cls: "markdown-db-record-title-input",
            value: this.titleValue,
            placeholder: "Untitled"
        });
        titleInput.oninput = (e) => {
            this.titleValue = (e.target as HTMLInputElement).value;
        };

        const nextButton = header.createEl("button", {
            cls: "markdown-db-record-nav-button"
        });
        nextButton.type = "button";
        nextButton.disabled = this.currentIndex >= this.navigationItems.length - 1;
        nextButton.setAttr("aria-label", "Next record");
        setIcon(nextButton, "chevron-right");
        nextButton.onclick = async () => {
            await this.navigateToRecord(this.currentIndex + 1);
        };

        const propsSection = container.createDiv({ cls: "markdown-db-record-properties" });
        propsSection.createEl("h4", { text: "Properties" });

        if (this.propertiesValue.length === 0) {
            propsSection.createDiv({
                cls: "setting-item-description",
                text: "No properties in this record."
            });
        } else {
            this.propertiesValue.forEach((property, index) => {
                const row = propsSection.createDiv({ cls: "markdown-db-record-property-row" });
                row.createDiv({
                    cls: "markdown-db-record-property-label",
                    text: property.key
                });

                const field = row.createDiv({
                    cls: "markdown-db-record-property-field"
                });
                this.createPropertyInput(field, property, index);
            });
        }

        this.contentSection = container.createDiv({ cls: "markdown-db-record-content" });
        await this.renderContentSection();
    }

    async onOpen() {
        this.component.load();
        this.modalEl.addClass("markdown-db-record-modal-shell");
        window.addEventListener("keydown", this.keydownHandler);
        await this.loadRecordState(this.record);
        await this.renderModalContent();
    }

    async onClose() {
        await this.saveCurrentRecord();

        window.removeEventListener("keydown", this.keydownHandler);
        this.modalEl.removeClass("markdown-db-record-modal-shell");
        this.component.unload();
        this.contentEl.empty();
    }
}
