import { App, Modal, Setting, Notice } from "obsidian";
import { t } from "../i18n";

export class AddSecretModal extends Modal {
    onSave: (key: string, value: string) => void;
    keyInput: string = "";
    valueInput: string = "";

    constructor(app: App, onSave: (key: string, value: string) => void) {
        super(app);
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: t("modals.addSecret.title") });

        new Setting(contentEl)
            .setName(t("modals.addSecret.keyName"))
            .addText(text => text
                .setPlaceholder(t("modals.addSecret.keyPlaceholder"))
                .onChange(val => this.keyInput = val)
            );

        new Setting(contentEl)
            .setName(t("modals.addSecret.valueName"))
            .addText(text => {
                text.inputEl.type = "password";
                text.setPlaceholder(t("modals.addSecret.valuePlaceholder"))
                text.onChange(val => this.valueInput = val)
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t("common.cancel"))
                .onClick(() => this.close())
            )
            .addButton(btn => btn
                .setButtonText(t("common.save"))
                .setCta()
                .onClick(() => {
                    if (!this.keyInput || !this.valueInput) {
                        new Notice(t("modals.addSecret.emptyError"));
                        return;
                    }
                    if (!/^[a-z0-9-]+$/.test(this.keyInput)) {
                        new Notice(t("modals.addSecret.invalidId"));
                        return;
                    }
                    this.onSave(this.keyInput, this.valueInput);
                    this.close();
                })
            );
    }

    onClose() {
        this.contentEl.empty();
    }
}
