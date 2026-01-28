import { App, Modal, TFile, Component, Setting, MarkdownRenderer } from "obsidian";
import { DatabaseRecord } from "../database/schema";
import { updateRecordRaw } from "../database/writer";

export class RecordModal extends Modal {
    record: DatabaseRecord;
    file: TFile;
    component: Component;

    constructor(app: App, file: TFile, record: DatabaseRecord) {
        super(app);
        this.record = record;
        this.file = file;
        this.component = new Component();
    }

    async onOpen() {
        const { contentEl } = this;
        this.component.load();

        contentEl.classList.add("markdown-db-record-modal");

        // Fetch content
        const fileContent = await this.app.vault.read(this.file);
        const lines = fileContent.split(/\r?\n/);
        const recordLines = lines.slice(this.record.lineStart, this.record.lineEnd + 1);

        // Parse content into sections
        let title = "";
        let propertiesContent = "";
        const contentLines: string[] = [];

        recordLines.forEach((line, index) => {
            if (index === 0) {
                // Header - strip "## "
                title = line.replace(/^##\s+/, "");
                return;
            }
            
            const trimmed = line.trim();
            if (trimmed.startsWith("%%") && trimmed.endsWith("%%")) {
                // Properties block
                propertiesContent = trimmed.substring(2, trimmed.length - 2).trim();
            } else {
                contentLines.push(line);
            }
        });

        // Trim leading empty lines from content
        while (contentLines.length > 0 && contentLines[0].trim() === "") {
            contentLines.shift();
        }

        const propertiesText = propertiesContent;
        const contentText = contentLines.join("\n");

        // UI Construction
        const container = contentEl.createDiv({ cls: "markdown-db-record-modal-container" });
        // Removed H2 "Edit Record"

        // State variables for auto-save
        let currentTitle = title;
        let currentProperties = propertiesText;
        let currentContent = contentText;

        // Title Input - Large Header Style
        const titleInput = container.createEl("input", {
            type: "text",
            cls: "markdown-db-record-title-input",
            value: title,
            placeholder: "Untitled"
        });
        titleInput.oninput = (e) => {
            currentTitle = (e.target as HTMLInputElement).value;
        };

        // Properties Section
        const propsSection = container.createDiv({ cls: "markdown-db-record-properties" });
        propsSection.createEl("h4", { text: "Properties (inside %% block)" });
        const propsTextarea = propsSection.createEl("textarea", { 
            text: propertiesText,
            placeholder: "[key:: type(value)] [key2:: type(val2)]"
        });
        propsTextarea.oninput = (e) => {
            currentProperties = (e.target as HTMLTextAreaElement).value;
        };

        // Content Section
        const contentSection = container.createDiv({ cls: "markdown-db-record-content" });
        
        // Functions to toggle between Preview and Edit
        const renderContent = async () => {
            contentSection.empty();
            const previewContainer = contentSection.createDiv({ cls: "markdown-db-record-preview" });
            
            // Add some basic styles for the preview container to make it fill space and be clickable
            previewContainer.style.flex = "1";
            previewContainer.style.overflowY = "auto";
            previewContainer.style.padding = "8px";
            previewContainer.style.cursor = "text";
            previewContainer.style.minHeight = "100px";

            if (!currentContent.trim()) {
                previewContainer.setText("Empty content. Click to edit...");
                previewContainer.style.color = "var(--text-faint)";
            } else {
                await MarkdownRenderer.render(
                    this.app,
                    currentContent,
                    previewContainer,
                    this.file.path,
                    this.component
                );
            }

            previewContainer.onclick = (e) => {
                if (e.target instanceof HTMLAnchorElement) return;
                switchToEdit();
            };
        };

        const switchToEdit = () => {
            contentSection.empty();
            const textarea = contentSection.createEl("textarea", { 
                text: currentContent,
                placeholder: "Type content..."
            });
            // Ensure textarea has styles to fill
            textarea.style.height = "100%";
            textarea.style.width = "100%";
            textarea.style.resize = "none";
            
            textarea.focus();

            textarea.oninput = (e) => {
                currentContent = (e.target as HTMLTextAreaElement).value;
            };

            textarea.onblur = () => {
                renderContent();
            };
        };

        // Initial Render
        renderContent();
        
        // Auto-save on Close logic
        this.onClose = async () => {
             // Reconstruct the raw record block
             const header = `## ${currentTitle}`;
             const props = currentProperties.trim();
             const content = currentContent;
             
             let newBlock = header;
             if (props) {
                 newBlock += `\n%% ${props} %%`;
             }
             // Ensure separation between properties and content if both exist
             if (content) {
                 newBlock += "\n\n" + content;
             } else if (props) {
                 newBlock += "\n"; // Just a newline at end if no content
             }

             // Only update if changed (simple check or always update)
             // Always update is safer for now to ensure consistency
             await updateRecordRaw(this.app, this.file, this.record, newBlock);
             
             this.component.unload();
             contentEl.empty();
        };
    }

    async onClose() {
        // Overridden in onOpen
    }
}
