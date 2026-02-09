import { App, Modal, Setting } from "obsidian";

export class CreateFolderModal extends Modal {
    folderName: string;
    onSubmit: (folderName: string) => void;

    constructor(app: App, onSubmit: (folderName: string) => void) {
        super(app);
        this.folderName = "";
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Create New Folder" });

        const setting = new Setting(contentEl)
            .setName("Name")
            .setDesc("Enter the name for your new folder")
            .addText((text) => {
                text
                    .onChange((value) => {
                        this.folderName = value;
                    });
                text.inputEl.focus();
                text.inputEl.addEventListener("keypress", (e) => {
                    if (e.key === "Enter") {
                        this.submit();
                    }
                });
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Create")
                    .setCta()
                    .onClick(() => {
                        this.submit();
                    })
            );
    }

    submit() {
        this.close();
        this.onSubmit(this.folderName);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
