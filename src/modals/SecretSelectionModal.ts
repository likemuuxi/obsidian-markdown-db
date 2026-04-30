import { App, Modal, Notice, setIcon } from "obsidian";
import { AddSecretModal } from "./AddSecretModal";

export class SecretSelectionModal extends Modal {
    onSelect: (value: string) => void;
    secrets: string[] = [];
    searchQuery: string = "";
    selectedKey: string | null = null;
    visibleSecrets: Set<string> = new Set();
    listContainer: HTMLElement;

    initialValue: string | null;

    constructor(app: App, initialValue: string | null, onSelect: (value: string) => void) {
        super(app);
        this.initialValue = initialValue;
        this.onSelect = onSelect;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Remove default padding from obsidian modal content
        contentEl.addClass("secret-selection-modal");

        // Header
        const header = contentEl.createEl("h2", { text: "选择密钥" });
        header.addClass("secret-modal-title");

        // Search Bar
        const searchContainer = contentEl.createDiv({ cls: "secret-modal-search" });
        const searchIcon = searchContainer.createDiv({ cls: "secret-search-icon" });
        setIcon(searchIcon, "search");
        
        const searchInput = searchContainer.createEl("input", {
            type: "text",
            placeholder: "查找密钥..."
        });
        searchInput.oninput = (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
            this.renderList();
        };

        // List Container
        this.listContainer = contentEl.createDiv({ cls: "secret-list" });

        // Footer
        const footer = contentEl.createDiv({ cls: "secret-modal-footer" });
        
        const leftFooter = footer.createDiv({ cls: "secret-footer-left" });
        const addBtn = leftFooter.createEl("button", { text: "添加密钥..." });
        addBtn.onclick = () => {
            new AddSecretModal(this.app, async (key, value) => {
                const secretStorage = (this.app as any).secretStorage;
                if (secretStorage) {
                    await secretStorage.setSecret(key, value);
                    await this.loadSecrets();
                    this.selectedKey = key;
                    this.renderList();
                }
            }).open();
        };

        const rightFooter = footer.createDiv({ cls: "secret-footer-right" });
        const cancelBtn = rightFooter.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => this.close();

        const saveBtn = rightFooter.createEl("button", { text: "保存", cls: "secret-save-btn mod-cta" });
        saveBtn.onclick = () => {
            if (this.selectedKey) {
                const secretStorage = (this.app as any).secretStorage;
                const val = secretStorage.getSecret(this.selectedKey);
                this.onSelect(val);
                this.close();
            } else {
                new Notice("请先选择一个密钥");
            }
        };

        await this.loadSecrets();
        this.renderList();
    }

    async loadSecrets() {
        const secretStorage = (this.app as any).secretStorage;
        if (!secretStorage || !secretStorage.listSecrets) {
            this.secrets = [];
            return;
        }
        const secretsRaw = await secretStorage.listSecrets();
        this.secrets = Array.isArray(secretsRaw) ? secretsRaw : Object.keys(secretsRaw || {});

        if (this.initialValue && !this.selectedKey) {
            for (const key of this.secrets) {
                if (secretStorage.getSecret(key) === this.initialValue) {
                    this.selectedKey = key;
                    break;
                }
            }
        }
    }

    renderList() {
        this.listContainer.empty();
        
        const filtered = this.secrets.filter(key => key.toLowerCase().includes(this.searchQuery));

        if (filtered.length === 0) {
            this.listContainer.createEl("div", { text: "未找到密钥", cls: "secret-list-empty" });
            return;
        }

        filtered.forEach(key => {
            const isSelected = this.selectedKey === key;
            const item = this.listContainer.createDiv({ cls: `secret-list-item ${isSelected ? 'is-selected' : ''}` });
            
            // Left click area (selects the item)
            const mainClickArea = item.createDiv({ cls: "secret-item-main" });
            mainClickArea.onclick = () => {
                this.selectedKey = key;
                this.renderList();
            };

            const radio = mainClickArea.createDiv({ cls: `secret-item-radio ${isSelected ? 'is-checked' : ''}` });
            if (isSelected) {
                // draw an inner circle
                radio.createDiv({ cls: "secret-item-radio-inner" });
            }

            mainClickArea.createSpan({ text: key, cls: "secret-item-name" });
            
            if (isSelected) {
                mainClickArea.createSpan({ text: "已选择", cls: "secret-item-badge" });
            }

            // Right actions area
            const actionsArea = item.createDiv({ cls: "secret-item-actions" });
            
            const isVisible = this.visibleSecrets.has(key);
            const valSpan = actionsArea.createSpan({ cls: "secret-item-value" });
            if (isVisible) {
                const secretStorage = (this.app as any).secretStorage;
                valSpan.textContent = secretStorage.getSecret(key) || "";
            } else {
                valSpan.textContent = "・ ・ ・ ・ ・ ・ ・ ・";
            }

            const eyeBtn = actionsArea.createDiv({ cls: "secret-action-btn secret-eye-btn" });
            setIcon(eyeBtn, isVisible ? "eye-off" : "eye");
            eyeBtn.onclick = (e) => {
                e.stopPropagation();
                if (isVisible) {
                    this.visibleSecrets.delete(key);
                } else {
                    this.visibleSecrets.add(key);
                }
                this.renderList();
            };

            const trashBtn = actionsArea.createDiv({ cls: "secret-action-btn secret-trash-btn" });
            setIcon(trashBtn, "trash-2");
            trashBtn.onclick = async (e) => {
                e.stopPropagation();
                const secretStorage = (this.app as any).secretStorage;
                if (secretStorage.deleteSecret) {
                    await secretStorage.deleteSecret(key);
                } else if (secretStorage.clearSecret) {
                    await secretStorage.clearSecret(key);
                }
                if (this.selectedKey === key) {
                    this.selectedKey = null;
                }
                await this.loadSecrets();
                this.renderList();
            };
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
