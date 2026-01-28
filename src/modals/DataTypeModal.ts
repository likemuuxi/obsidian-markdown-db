import { App, Modal, Setting, Notice } from "obsidian";

export class DataTypeModal extends Modal {
    onSubmit: (type: string) => void;

    constructor(app: App, onSubmit: (type: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Select Data Type" });

        new Setting(contentEl)
            .setName("Source Type")
            .setDesc("Choose the format of the source files")
            .addDropdown((dropdown) => {
                dropdown.addOption("obsidian", "Obsidian (Markdown Frontmatter)");
                // Future types can be added here
                dropdown.setValue("obsidian");
                dropdown.onChange((value) => {
                    // Store value if needed, for now only one option
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Next")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit("obsidian");
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
