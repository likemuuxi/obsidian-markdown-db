import { ItemView, WorkspaceLeaf, TFile, Setting } from "obsidian";
import { DatabaseRecord, parseFile } from "../database/parser";
import { updateRecordRaw } from "../database/writer";

export const VIEW_TYPE_RECORD_EDIT = "markdown-db-record-edit";

export class RecordEditView extends ItemView {
    recordTitle: string | null = null;
    filePath: string | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return VIEW_TYPE_RECORD_EDIT;
    }

    getDisplayText() {
        return this.recordTitle ? `Edit: ${this.recordTitle}` : "Edit Record";
    }

    getIcon() {
        return "pencil";
    }

    async setState(state: any, result: any) {
        if (state.file && state.record) {
            this.filePath = state.file;
            this.recordTitle = state.record;
            await this.refresh();
        }
        super.setState(state, result);
    }

    async refresh() {
        const { contentEl } = this;
        contentEl.empty();

        if (!this.filePath || !this.recordTitle) {
            contentEl.createEl("div", { text: "No record selected." });
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(this.filePath);
        if (!(file instanceof TFile)) {
            contentEl.createEl("div", { text: "File not found." });
            return;
        }

        const content = await this.app.vault.read(file);
        const data = parseFile(content);
        const record = data.records.find(r => r.title === this.recordTitle);

        if (!record) {
            contentEl.createEl("div", { text: "Record not found." });
            return;
        }

        this.renderEditor(file, record, content);
    }

    renderEditor(file: TFile, record: DatabaseRecord, fileContent: string) {
        const { contentEl } = this;
        const container = contentEl.createDiv({ cls: "markdown-db-record-edit-container" });
        container.style.padding = "10px";
        container.style.maxWidth = "800px";
        container.style.margin = "0 auto";

        container.createEl("h2", { text: `Edit: ${record.title}` });

        const lines = fileContent.split(/\r?\n/);
        const recordLines = lines.slice(record.lineStart, record.lineEnd + 1);

        // Parse content into sections
        let title = "";
        const propertyLines: string[] = [];
        const contentLines: string[] = [];
        const propertyRegex = /\[(.*?)::(.*?)\]/;

        recordLines.forEach((line, index) => {
            if (index === 0) {
                // Header - strip "## "
                title = line.replace(/^##\s+/, "");
                return;
            }
            
            if (propertyRegex.test(line)) {
                propertyLines.push(line);
            } else {
                contentLines.push(line);
            }
        });

        // Trim leading empty lines from content
        while (contentLines.length > 0 && contentLines[0].trim() === "") {
            contentLines.shift();
        }

        const propertiesText = propertyLines.join("\n");
        const contentText = contentLines.join("\n");

        // Title Input
        let newTitle = title;
        new Setting(container)
            .setName("Title")
            .addText(text => text
                .setValue(title)
                .onChange(value => {
                    newTitle = value;
                })
                .inputEl.style.width = "100%");

        // Properties Input
        container.createEl("h4", { text: "Properties" });
        const propsTextarea = container.createEl("textarea", { 
            cls: "markdown-db-content-modal-textarea",
            text: propertiesText
        });
        propsTextarea.style.height = "100px";
        propsTextarea.style.marginBottom = "10px";
        propsTextarea.style.width = "100%";

        // Content Input
        container.createEl("h4", { text: "Content" });
        const contentTextarea = container.createEl("textarea", { 
            cls: "markdown-db-content-modal-textarea",
            text: contentText 
        });
        contentTextarea.style.height = "300px";
        contentTextarea.style.width = "100%";
        
        // Buttons
        const buttonContainer = container.createDiv({ cls: "markdown-db-modal-buttons", style: "margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;" });
        const saveBtn = buttonContainer.createEl("button", { text: "Save", cls: "mod-cta" });
        const cancelBtn = buttonContainer.createEl("button", { text: "Close" });
        
        saveBtn.onclick = async () => {
            // Reconstruct the raw record block
            const header = `## ${newTitle}`;
            const props = propsTextarea.value.trim();
            const content = contentTextarea.value;
            
            let newBlock = header;
            if (props) {
                newBlock += "\n" + props;
            }
            // Ensure separation between properties and content if both exist
            if (content) {
                newBlock += "\n\n" + content;
            } else if (props) {
                newBlock += "\n"; // Just a newline at end if no content
            }

            await updateRecordRaw(this.app, file, record, newBlock);
            
            // Optionally close the window/leaf?
            // Usually in a "window" mode, user might want to keep it open or close it.
            // Let's detach the leaf on save to act like a "popup dialog".
            this.leaf.detach();
        };
        
        cancelBtn.onclick = () => {
            this.leaf.detach();
        };
    }

    async onOpen() {
        // Initial render handled by setState
    }

    async onClose() {
        // Cleanup
    }
}
