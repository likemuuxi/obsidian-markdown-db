import { App, Modal, Setting } from "obsidian";

export class CreateDatabaseModal extends Modal {
    filename: string;
    onSubmit: (filename: string) => void;

    constructor(app: App, defaultName: string, onSubmit: (filename: string) => void) {
        super(app);
        this.filename = defaultName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Create New Database" });

        const setting = new Setting(contentEl)
            .setName("Name")
            .setDesc("Enter the name for your new database")
            .addText((text) => {
                text
                    .setValue(this.filename)
                    .onChange((value) => {
                        this.filename = value;
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
        this.onSubmit(this.filename);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
