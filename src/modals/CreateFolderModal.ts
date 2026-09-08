import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

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
        contentEl.createEl("h2", { text: t("modals.createFolder.title") });

        const setting = new Setting(contentEl)
            .setName(t("common.name"))
            .setDesc(t("modals.createFolder.nameDesc"))
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
                    .setButtonText(t("common.create"))
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
