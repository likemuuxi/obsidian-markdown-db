import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

export class CreateDatabaseModal extends Modal {
    filename: string;
    onSubmit: (filename: string) => void;

    folderPath?: string;

    constructor(app: App, defaultName: string, onSubmit: (filename: string) => void, folderPath?: string) {
        super(app);
        this.filename = defaultName;
        this.onSubmit = onSubmit;
        this.folderPath = folderPath;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: t("modals.createDatabase.title") });

        const setting = new Setting(contentEl)
            .setName(t("common.name"))
            .setDesc(t("modals.createDatabase.nameDesc"))
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
                    .setButtonText(t("common.create"))
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
