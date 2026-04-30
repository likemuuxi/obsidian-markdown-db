import { App, Modal, Setting, Notice } from "obsidian";

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
        contentEl.createEl("h2", { text: "添加新密钥" });

        new Setting(contentEl)
            .setName("密钥名称 (Key)")
            .addText(text => text
                .setPlaceholder("e.g. my-github-token")
                .onChange(val => this.keyInput = val)
            );

        new Setting(contentEl)
            .setName("密钥内容 (Value)")
            .addText(text => {
                text.inputEl.type = "password";
                text.setPlaceholder("输入密钥内容...")
                text.onChange(val => this.valueInput = val)
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("取消")
                .onClick(() => this.close())
            )
            .addButton(btn => btn
                .setButtonText("保存")
                .setCta()
                .onClick(() => {
                    if (!this.keyInput || !this.valueInput) {
                        new Notice("密钥名称和内容不能为空！");
                        return;
                    }
                    if (!/^[a-z0-9-]+$/.test(this.keyInput)) {
                        new Notice("密钥 ID 无效。请仅使用小写字母、数字和破折号。");
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
