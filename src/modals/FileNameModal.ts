import { App, Modal, Setting } from "obsidian";

export class FileNameModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Enter Database Name" });

        let inputVal = "";

        new Setting(contentEl)
            .setName("Database Name")
            .addText((text) =>
                text.onChange((value) => {
                    inputVal = value;
                })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Create")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(inputVal);
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
