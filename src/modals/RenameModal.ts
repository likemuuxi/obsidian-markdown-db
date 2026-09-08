import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

export class RenameModal extends Modal {
    newName: string;
    onSubmit: (newName: string) => void;

    constructor(app: App, currentName: string, onSubmit: (newName: string) => void) {
        super(app);
        this.newName = currentName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: t("modals.renameDatabase.title") });

        const setting = new Setting(contentEl)
            .setName(t("common.name"))
            .addText((text) => {
                text
                    .setValue(this.newName)
                    .onChange((value) => {
                        this.newName = value;
                    });
                // Focus the input
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
                    .setButtonText(t("common.rename"))
                    .setCta()
                    .onClick(() => {
                        this.submit();
                    })
            );
    }

    submit() {
        this.close();
        this.onSubmit(this.newName);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
