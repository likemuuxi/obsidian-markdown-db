import { Setting, setIcon, Notice, normalizePath, TFile, stringifyYaml } from "obsidian";
import type MyPlugin from "../main";
import type { NotionSyncConfig } from "../settings";
import { NotionAPI } from "../utils/notion-api";
import { SecretSelectionModal } from "../modals/SecretSelectionModal";
import { FileSuggest } from "../suggest/suggest";
import { t } from "../i18n";

export class IntegrationSettingsView {
    plugin: MyPlugin;
    container: HTMLElement | null = null;
    activeIntegration: string | null = null;
    editingNotionConfigId: string | null = null;
    currentEditingConfig: NotionSyncConfig | null = null;
    isDirty: boolean = false;

    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }

    mount(parentEl: HTMLElement) {
        this.container = parentEl.createDiv();
        this.display();
    }

    display() {
        if (!this.container) return;
        const containerEl = this.container;
        containerEl.empty();

        if (this.activeIntegration === 'github') {
            this.renderGithubSettings(containerEl);
        } else if (this.activeIntegration === 'notion') {
            if (this.editingNotionConfigId) {
                this.renderNotionConfigEdit(containerEl);
            } else {
                this.renderNotionSettings(containerEl);
            }
        } else {
            this.renderIntegrationList(containerEl);
        }
    }

    renderIntegrationList(containerEl: HTMLElement) {
        containerEl.createEl('h2', { text: t("settings.integration.title") });

        const integrations = [
            {
                id: 'github',
                name: t("settings.integration.githubName"),
                desc: t("settings.integration.githubDesc")
            },
            {
                id: 'notion',
                name: t("settings.integration.notionName"),
                desc: t("settings.integration.notionDesc")
            }
        ];

        const listContainer = containerEl.createDiv({ cls: 'markdown-db-integration-list' });
        listContainer.style.marginTop = '20px';

        integrations.forEach(integration => {
            const item = listContainer.createDiv({ cls: 'markdown-db-integration-item' });
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.padding = '15px';
            item.style.marginBottom = '10px';
            item.style.borderRadius = '6px';
            item.style.backgroundColor = 'var(--background-secondary)';
            item.style.cursor = 'pointer';
            item.style.border = '1px solid var(--background-modifier-border)';

            item.onmouseover = () => {
                item.style.backgroundColor = 'var(--background-secondary-alt)';
            };
            item.onmouseout = () => {
                item.style.backgroundColor = 'var(--background-secondary)';
            };

            item.onclick = () => {
                this.activeIntegration = integration.id;
                this.display();
            };

            const contentDiv = item.createDiv({ cls: 'markdown-db-integration-content' });
            contentDiv.style.flex = '1';

            const title = contentDiv.createDiv({ cls: 'markdown-db-integration-title' });
            title.setText(integration.name);
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '4px';

            const desc = contentDiv.createDiv({ cls: 'markdown-db-integration-desc' });
            desc.setText(integration.desc);
            desc.style.color = 'var(--text-muted)';
            desc.style.fontSize = '0.9em';

            const arrowDiv = item.createDiv();
            setIcon(arrowDiv, 'chevron-right');
            arrowDiv.style.color = 'var(--text-muted)';
        });
    }

    renderHeader(containerEl: HTMLElement, titleText: string, onBack?: () => void) {
        const header = containerEl.createDiv({ cls: 'markdown-db-settings-header' });
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.marginBottom = '20px';
        header.style.cursor = 'pointer';

        const backBtn = header.createDiv({ cls: 'clickable-icon' });
        setIcon(backBtn, 'arrow-left');
        backBtn.style.marginRight = '10px';
        backBtn.onclick = onBack || (() => {
            this.activeIntegration = null;
            this.display();
        });

        header.createEl('h2', { text: titleText, attr: { style: 'margin: 0;' } });
    }

    renderGithubSettings(containerEl: HTMLElement) {
        this.renderHeader(containerEl, t("settings.integration.githubName"));

        new Setting(containerEl)
            .setName(t("settings.integration.githubUsername"))
            .addText(text => text
                .setValue(this.plugin.settings.githubUsername)
                .onChange(async (value) => {
                    this.plugin.settings.githubUsername = value;
                    await this.plugin.saveSettings();
                }));

        let githubTokenText: any;
        new Setting(containerEl)
            .setName(t("settings.integration.githubToken"))
            .setDesc(t("settings.integration.githubTokenDesc"))
            .addText(text => {
                githubTokenText = text;
                text.inputEl.type = "password";
                text.setPlaceholder(t("settings.integration.ghpPlaceholder"));
                // Load token asynchronously
                if ((this.plugin.app as any).secretStorage) {
                    const token = (this.plugin.app as any).secretStorage.getSecret('db-github-token');
                    if (token) text.setValue(token);
                }

                text.onChange(async (value) => {
                    if ((this.plugin.app as any).secretStorage) {
                        await (this.plugin.app as any).secretStorage.setSecret('db-github-token', value);
                    }
                });
            })
            .addButton(btn => btn
                .setButtonText(t("common.select"))
                .onClick(() => {
                    const currentVal = githubTokenText.getValue();
                    new SecretSelectionModal(this.plugin.app, currentVal, async (selectedVal) => {
                        githubTokenText.setValue(selectedVal);
                        if ((this.plugin.app as any).secretStorage) {
                            await (this.plugin.app as any).secretStorage.setSecret('db-github-token', selectedVal);
                        }
                    }).open();
                })
            );

        new Setting(containerEl)
            .setName(t("settings.integration.targetDbStars"))
            .setDesc(t("settings.integration.targetDbStarsDesc"))
            .addText(text => {
                new FileSuggest(this.plugin.app, text.inputEl);
                text
                    .setPlaceholder(t("settings.integration.targetDbStarsPlaceholder"))
                    .setValue(this.plugin.settings.githubSyncStarsDb)
                    .onChange(async (value) => {
                        this.plugin.settings.githubSyncStarsDb = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(t("settings.integration.targetDbPrs"))
            .setDesc(t("settings.integration.targetDbPrsDesc"))
            .addText(text => {
                new FileSuggest(this.plugin.app, text.inputEl);
                text
                    .setPlaceholder(t("settings.integration.targetDbPrsPlaceholder"))
                    .setValue(this.plugin.settings.githubSyncPrsDb)
                    .onChange(async (value) => {
                        this.plugin.settings.githubSyncPrsDb = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(t("settings.integration.enableAutoSync"))
            .setDesc(t("settings.integration.enableAutoSyncDesc"))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSyncGithub)
                .onChange(async (value) => {
                    this.plugin.settings.autoSyncGithub = value;
                    await this.plugin.saveSettings();
                }));
    }

    renderNotionSettings(containerEl: HTMLElement) {
        this.renderHeader(containerEl, t("settings.integration.notionName"));

        let notionTokenText: any;
        new Setting(containerEl)
            .setName(t("settings.integration.notionToken"))
            .setDesc(t("settings.integration.notionTokenDesc"))
            .addText(text => {
                notionTokenText = text;
                text.inputEl.type = "password";
                text.setPlaceholder(t("settings.integration.secretPlaceholder"));
                // Load token asynchronously
                if ((this.plugin.app as any).secretStorage) {
                    const token = (this.plugin.app as any).secretStorage.getSecret('db-notion-api-key');
                    if (token) text.setValue(token);
                }

                text.onChange(async (value) => {
                    if ((this.plugin.app as any).secretStorage) {
                        await (this.plugin.app as any).secretStorage.setSecret('db-notion-api-key', value);
                    }
                });
            })
            .addButton(btn => btn
                .setButtonText(t("common.select"))
                .onClick(() => {
                    const currentVal = notionTokenText.getValue();
                    new SecretSelectionModal(this.plugin.app, currentVal, async (selectedVal) => {
                        notionTokenText.setValue(selectedVal);
                        if ((this.plugin.app as any).secretStorage) {
                            await (this.plugin.app as any).secretStorage.setSecret('db-notion-api-key', selectedVal);
                        }
                    }).open();
                })
            );

        new Setting(containerEl)
            .setName(t("settings.integration.notionDatabases"))
            .setDesc(t("settings.integration.notionDatabasesDesc"))
            .addButton(btn => btn
                .setButtonText(t("settings.integration.addDatabase"))
                .setCta()
                .onClick(() => {
                    this.editingNotionConfigId = 'new';
                    this.currentEditingConfig = null;
                    this.display();
                }));

        const listContainer = containerEl.createDiv({ cls: 'markdown-db-notion-list' });

        if (this.plugin.settings.notionSyncConfigs.length === 0) {
            listContainer.createDiv({
                text: t("settings.integration.noNotionConfigs"),
                cls: 'setting-item-description',
                attr: { style: 'padding: 10px; font-style: italic;' }
            });
        } else {
            this.plugin.settings.notionSyncConfigs.forEach(config => {
                const item = listContainer.createDiv({ cls: 'markdown-db-integration-item' });
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.justifyContent = 'space-between';
                item.style.padding = '10px 15px';
                item.style.marginBottom = '10px';
                item.style.borderRadius = '6px';
                item.style.backgroundColor = 'var(--background-secondary)';
                item.style.border = '1px solid var(--background-modifier-border)';

                const infoDiv = item.createDiv();
                const title = infoDiv.createDiv({ cls: 'markdown-db-integration-title' });
                title.setText(config.name || t("settings.integration.untitledConfig"));
                title.style.fontWeight = 'bold';

                const detail = infoDiv.createDiv({ cls: 'markdown-db-integration-desc' });
                detail.setText(t("settings.integration.configDetail", { id: `${config.databaseId.slice(0, 8)}...`, target: config.targetDbPath }));
                detail.style.color = 'var(--text-muted)';
                detail.style.fontSize = '0.85em';

                const actionsDiv = item.createDiv({ cls: 'markdown-db-integration-actions' });
                actionsDiv.style.display = 'flex';
                actionsDiv.style.gap = '5px';

                const editBtn = actionsDiv.createEl('button', { cls: 'clickable-icon' });
                setIcon(editBtn, 'pencil');
                editBtn.onclick = () => {
                    this.editingNotionConfigId = config.id;
                    this.currentEditingConfig = null;
                    this.display();
                };

                const deleteBtn = actionsDiv.createEl('button', { cls: 'clickable-icon' });
                setIcon(deleteBtn, 'trash');
                deleteBtn.style.color = 'var(--text-error)';
                deleteBtn.onclick = async () => {
                    if (confirm(t("settings.integration.deleteConfigConfirm", { name: config.name }))) {
                        this.plugin.settings.notionSyncConfigs = this.plugin.settings.notionSyncConfigs.filter(c => c.id !== config.id);
                        await this.plugin.saveSettings();
                        this.display();
                    }
                };
            });
        }
    }

    renderNotionConfigEdit(containerEl: HTMLElement) {
        const isNew = this.editingNotionConfigId === 'new';
        let config: NotionSyncConfig;

        if (this.currentEditingConfig && (isNew || this.currentEditingConfig.id === this.editingNotionConfigId)) {
            config = this.currentEditingConfig;
        } else if (isNew) {
            config = {
                id: crypto.randomUUID(),
                name: t("settings.integration.newConfigName"),
                databaseId: '',
                targetDbPath: '',
                properties: [],
                syncDirection: 'push',
                autoSyncOnStartup: false
            };
            this.currentEditingConfig = config;
            this.isDirty = true;
        } else {
            const existing = this.plugin.settings.notionSyncConfigs.find(c => c.id === this.editingNotionConfigId);
            if (!existing) {
                this.editingNotionConfigId = null;
                this.currentEditingConfig = null;
                this.display();
                return;
            }
            // Clone to avoid direct mutation before save
            config = JSON.parse(JSON.stringify(existing));
            // Migration for old config structure if needed
            if ((config as any).fieldMappings && !config.properties) {
                config.properties = [];
                delete (config as any).fieldMappings;
            }
            this.currentEditingConfig = config;
            this.isDirty = false;
        }

        this.renderHeader(containerEl, isNew ? t("settings.integration.addNotionDbTitle") : t("settings.integration.editNotionDbTitle"), () => {
            this.editingNotionConfigId = null;
            this.currentEditingConfig = null;
            this.display();
        });

        let updateActionButtons = () => { };

        // --- Fields ---
        new Setting(containerEl)
            .setName(t("settings.integration.configName"))
            .setDesc(t("settings.integration.configNameDesc"))
            .addText(text => text
                .setValue(config.name)
                .onChange(value => {
                    config.name = value;
                    this.isDirty = true;
                    updateActionButtons();
                }));

        new Setting(containerEl)
            .setName(t("settings.integration.notionDbId"))
            .setDesc(t("settings.integration.notionDbIdDesc"))
            .addText(text => text
                .setValue(config.databaseId)
                .onChange(value => {
                    config.databaseId = value;
                    this.isDirty = true;
                    updateActionButtons();
                }));

        new Setting(containerEl)
            .setName(t("settings.integration.syncDirection"))
            .setDesc(t("settings.integration.syncDirectionDesc"))
            .addDropdown(dropdown => dropdown
                .addOption('push', t("settings.integration.pushToNotion"))
                .addOption('pull', t("settings.integration.pullFromNotion"))
                .setValue(config.syncDirection || 'push')
                .onChange(value => {
                    config.syncDirection = value as 'push' | 'pull';
                    if (config.syncDirection === 'push') {
                        config.autoSyncOnStartup = false;
                    }
                    this.isDirty = true;
                    this.display();
                }));

        if (config.syncDirection === 'pull') {
            new Setting(containerEl)
                .setName(t("settings.integration.syncOnStartup"))
                .setDesc(t("settings.integration.syncOnStartupDesc"))
                .addToggle(toggle => toggle
                    .setValue(config.autoSyncOnStartup || false)
                    .onChange(value => {
                        config.autoSyncOnStartup = value;
                        this.isDirty = true;
                        updateActionButtons();
                    }));
        }

        // --- Test Connection Button ---
        const testBtnContainer = containerEl.createDiv();
        testBtnContainer.style.marginTop = '10px';
        testBtnContainer.style.display = 'flex';
        testBtnContainer.style.justifyContent = 'flex-end';
        testBtnContainer.style.gap = '10px';

        const testBtn = testBtnContainer.createEl('button', { text: t("common.test") });
        testBtn.setAttribute('aria-label', t("settings.integration.testAria"));
        testBtn.onclick = async () => {
            let token = "";
            if ((this.plugin.app as any).secretStorage) {
                token = await (this.plugin.app as any).secretStorage.getSecret('db-notion-api-key') || "";
            }
            if (!token || !config.databaseId) {
                new Notice(t("settings.integration.testFillFirst"));
                return;
            }

            testBtn.disabled = true;
            testBtn.setText(t("common.testing"));

            try {
                const notion = new NotionAPI(token);
                // Query without filters to check access
                await notion.queryDatabase(config.databaseId);
                new Notice(t("settings.integration.connectionSuccess"));
            } catch (error: any) {
                console.error(error);
                new Notice(t("settings.integration.connectionFailed", { error: error.message || t("settings.integration.unknownError") }));
            } finally {
                testBtn.disabled = false;
                testBtn.setText(t("common.test"));
            }
        };

        // --- Notion Properties ---
        if (config.syncDirection !== 'pull') {
            const propHeader = containerEl.createDiv({ cls: 'markdown-db-prop-header' });
            propHeader.style.display = 'flex';
            propHeader.style.alignItems = 'center';
            propHeader.style.justifyContent = 'space-between';
            propHeader.style.marginTop = '20px';
            propHeader.style.marginBottom = '10px';

            const leftHeader = propHeader.createDiv();
            leftHeader.createEl('h3', { text: t("settings.integration.notionPropertiesTitle"), attr: { style: 'margin: 0 0 5px 0;' } });

            const addBtn = propHeader.createEl('button', { cls: 'clickable-icon' });
            setIcon(addBtn, 'plus');
            addBtn.onclick = () => {
                config.properties.push({ name: '', type: 'Text' });
                this.isDirty = true;
                renderProperties();
                updateActionButtons();
            };

            const propertiesContainer = containerEl.createDiv();

            let draggedIndex: number | null = null;

            const renderProperties = () => {
                propertiesContainer.empty();
                config.properties.forEach((prop, index) => {
                    const row = propertiesContainer.createDiv({ cls: 'markdown-db-mapping-row' });
                    row.style.display = 'flex';
                    row.style.gap = '10px';
                    row.style.marginBottom = '10px';
                    row.style.alignItems = 'center';
                    // Add transition for smooth border appearance
                    row.style.transition = 'border 0.1s ease';
                    row.style.borderTop = '2px solid transparent';
                    row.style.borderBottom = '2px solid transparent';

                    // Drag Handle
                    const dragHandle = row.createDiv({ cls: 'clickable-icon' });
                    setIcon(dragHandle, 'grip-vertical');
                    dragHandle.style.cursor = 'grab';
                    dragHandle.style.flexShrink = '0';
                    dragHandle.setAttribute('draggable', 'true');

                    dragHandle.addEventListener('dragstart', (e) => {
                        draggedIndex = index;
                        e.dataTransfer?.setData('text/plain', index.toString());
                        e.dataTransfer!.effectAllowed = 'move';
                        e.dataTransfer?.setDragImage(row, 0, 0);
                        row.style.opacity = '0.5';
                    });

                    dragHandle.addEventListener('dragend', () => {
                        draggedIndex = null;
                        row.style.opacity = '1';
                        propertiesContainer.querySelectorAll('.markdown-db-mapping-row').forEach(el => {
                            (el as HTMLElement).style.borderTop = '2px solid transparent';
                            (el as HTMLElement).style.borderBottom = '2px solid transparent';
                        });
                    });

                    // Row Drop Targets
                    row.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        if (draggedIndex === null || draggedIndex === index) return;

                        if (draggedIndex < index) {
                            row.style.borderBottom = '2px solid var(--interactive-accent)';
                            row.style.borderTop = '2px solid transparent';
                        } else {
                            row.style.borderTop = '2px solid var(--interactive-accent)';
                            row.style.borderBottom = '2px solid transparent';
                        }
                    });

                    row.addEventListener('dragleave', () => {
                        row.style.borderTop = '2px solid transparent';
                        row.style.borderBottom = '2px solid transparent';
                    });

                    row.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        row.style.borderTop = '2px solid transparent';
                        row.style.borderBottom = '2px solid transparent';

                        const fromIndexStr = e.dataTransfer?.getData('text/plain');
                        if (fromIndexStr === undefined) return;
                        const fromIndex = parseInt(fromIndexStr);

                        if (!isNaN(fromIndex) && fromIndex !== index) {
                            const item = config.properties[fromIndex];
                            config.properties.splice(fromIndex, 1);
                            config.properties.splice(index, 0, item);

                            // Auto-save logic
                            let globalToken = "";
                            if ((this.plugin.app as any).secretStorage) {
                                globalToken = await (this.plugin.app as any).secretStorage.getSecret('db-notion-api-key') || "";
                            }
                            if (!config.name || !globalToken || !config.databaseId) {
                                new Notice(t("settings.integration.reorderedNotSaved"));
                                this.isDirty = true;
                                renderProperties();
                                updateActionButtons();
                                return;
                            }

                            // Check if order actually changed
                            const newProps = JSON.stringify(config.properties);
                            const oldProps = JSON.stringify(this.plugin.settings.notionSyncConfigs.find(c => c.id === config.id)?.properties || []);

                            if (newProps === oldProps) {
                                // Nothing changed
                                return;
                            }

                            if (isNew) {
                                this.plugin.settings.notionSyncConfigs.push(config);
                            } else {
                                const idx = this.plugin.settings.notionSyncConfigs.findIndex(c => c.id === config.id);
                                if (idx !== -1) {
                                    this.plugin.settings.notionSyncConfigs[idx] = config;
                                }
                            }

                            await this.plugin.saveSettings();
                            new Notice(t("settings.integration.notionConfigSaved"));

                            this.isDirty = false;
                            this.currentEditingConfig = null;
                            this.editingNotionConfigId = config.id;
                            this.display();
                        }
                    });

                    const nameInput = row.createEl('input', { type: 'text', placeholder: t("settings.integration.notionPropNamePlaceholder") });
                    nameInput.value = prop.name;
                    nameInput.style.flex = '1';
                    nameInput.onchange = (e) => {
                        prop.name = (e.target as HTMLInputElement).value;
                        this.isDirty = true;
                        updateActionButtons();
                    };

                    const typeSelect = row.createEl('select');
                    typeSelect.style.flex = '1';

                    const notionPropTypes = [
                        { value: 'Text', key: 'text' },
                        { value: 'Number', key: 'number' },
                        { value: 'Select', key: 'select' },
                        { value: 'Multi-Select', key: 'multiSelect' },
                        { value: 'Date', key: 'date' },
                        { value: 'Files & Media', key: 'files' },
                        { value: 'Checkbox', key: 'checkbox' },
                        { value: 'URL', key: 'url' }
                    ];
                    notionPropTypes.forEach(({ value, key }) => {
                        const option = typeSelect.createEl('option', { text: t(`settings.integration.notionPropTypes.${key}`), value: value });
                        if (value === prop.type) option.selected = true;
                    });
                    typeSelect.onchange = (e) => {
                        prop.type = (e.target as HTMLSelectElement).value;
                        this.isDirty = true;
                        updateActionButtons();
                    };

                    const delBtn = row.createEl('button', { cls: 'clickable-icon' });
                    setIcon(delBtn, 'trash');
                    delBtn.onclick = () => {
                        config.properties.splice(index, 1);
                        this.isDirty = true;
                        renderProperties();
                        updateActionButtons();
                    };
                });
            };

            renderProperties();
        }

        const actionsDiv = containerEl.createDiv();
        actionsDiv.style.marginTop = '30px';
        actionsDiv.style.display = 'flex';
        actionsDiv.style.alignItems = 'center';
        actionsDiv.style.justifyContent = 'flex-end';
        actionsDiv.style.gap = '10px';

        const generateOrUpdateDbFile = async (config: NotionSyncConfig) => {
            if (config.syncDirection !== 'pull' && config.properties.length === 0) {
                new Notice(t("settings.integration.addAtLeastOneProp"));
                return;
            }

            if (config.syncDirection === 'pull' && config.properties.length === 0) {
                try {
                    let token = "";
                    if ((this.plugin.app as any).secretStorage) {
                        token = await (this.plugin.app as any).secretStorage.getSecret('db-notion-api-key') || "";
                    }
                    if (!token || !config.databaseId) {
                        new Notice(t("settings.integration.fillTokenAndDbId"));
                        return;
                    }

                    new Notice(t("settings.integration.fetchingSchema"));
                    const api = new NotionAPI(token);
                    const db = await api.getDatabase(config.databaseId);

                    const props = db.properties;
                    for (const key in props) {
                        const p = props[key];
                        let type = 'Text';
                        switch (p.type) {
                            case 'number': type = 'Number'; break;
                            case 'select': type = 'Select'; break;
                            case 'multi_select': type = 'Multi-Select'; break;
                            case 'date': type = 'Date'; break;
                            case 'checkbox': type = 'Checkbox'; break;
                            case 'url': type = 'URL'; break;
                            case 'files': type = 'Files & Media'; break;
                            default: type = 'Text';
                        }
                        config.properties.push({ name: key, type: type });
                    }
                    new Notice(t("settings.integration.fetchedProps", { count: config.properties.length }));
                } catch (e: any) {
                    console.error(e);
                    new Notice(t("settings.integration.fetchSchemaFailed", { error: e.message || e }));
                    return;
                }
            }

            const safeName = config.name.replace(/[^a-zA-Z0-9]/g, '_') || 'NotionDB';
            const folder = this.plugin.settings.defaultDbFolder || '';
            let targetPath = folder ? `${folder}/${safeName}.md` : `${safeName}.md`;

            targetPath = normalizePath(targetPath);

            const frontmatter: any = {
                "markdown-db": true
            };

            const columnTypes: Record<string, string> = {};
            const columnOrder: string[] = [];

            config.properties.forEach(prop => {
                let dbType = "text";

                switch (prop.type.toLowerCase()) {
                    case 'number':
                        dbType = "number";
                        break;
                    case 'checkbox':
                        dbType = "boolean";
                        break;
                    case 'multi-select':
                        dbType = "multi";
                        break;
                    case 'date':
                        dbType = "date";
                        break;
                    case 'select':
                        dbType = "select";
                        break;
                    case 'url':
                        dbType = "link";
                        break;
                    case 'files':
                        dbType = "text";
                        break;
                    case 'rich_text':
                    case 'text':
                    default:
                        dbType = "text";
                        break;
                }
                columnTypes[prop.name] = dbType;
                columnOrder.push(prop.name);
            });

            const propertyParts = columnOrder.map(name => {
                const type = columnTypes[name];
                return `[${name}::${type}()]`;
            });
            const propertyBlock = propertyParts.length > 0 ? `%%\n${propertyParts.join('\n')}\n[notionUrl::link()]\n%%` : '';

            const content = `---\n${stringifyYaml(frontmatter)}---\n\n# ${config.name}\n\n## Example\n${propertyBlock}\n\n\n`;

            try {
                const existingFile = this.plugin.app.vault.getAbstractFileByPath(targetPath);
                if (existingFile instanceof TFile) {
                    // Update schema only
                    const currentContent = await this.plugin.app.vault.read(existingFile);

                    // Try to find ## Example block or property definition
                    const exampleRegex = new RegExp('(##\\s+Example\\s*\\n\\s*)(%%[\\s\\S]*?%%)');
                    let newContent = currentContent;

                    if (exampleRegex.test(currentContent)) {
                        newContent = currentContent.replace(exampleRegex, `$1${propertyBlock}`);
                    } else if (currentContent.includes("## Example")) {
                        // ## Example exists but no block? Append block
                        newContent = currentContent.replace("## Example", `## Example\n${propertyBlock}`);
                    } else {
                        // No Example section, append to end
                        newContent = currentContent + `\n\n## Example\n${propertyBlock}`;
                    }

                    if (newContent !== currentContent) {
                        await this.plugin.app.vault.modify(existingFile, newContent);
                        new Notice(t("settings.integration.updatedSchemaIn", { path: targetPath }));
                    } else {
                        new Notice(t("settings.integration.noChangesNeeded", { path: targetPath }));
                    }
                } else {
                    await this.plugin.app.vault.create(targetPath, content);
                    new Notice(t("settings.integration.createdTemplate", { path: targetPath }));
                }

                // Always update the target path and refresh UI
                config.targetDbPath = targetPath;

                // Auto-save the config with the new target path
                if (isNew) {
                    this.plugin.settings.notionSyncConfigs.push(config);
                } else {
                    const idx = this.plugin.settings.notionSyncConfigs.findIndex(c => c.id === config.id);
                    if (idx !== -1) {
                        this.plugin.settings.notionSyncConfigs[idx] = config;
                    }
                }
                await this.plugin.saveSettings();

                this.isDirty = false;
                this.currentEditingConfig = null;

                // Need to update the editing ID if it was new
                if (isNew) {
                    this.editingNotionConfigId = config.id;
                }

                updateActionButtons();
                // new Notice('Template generated. Please save configuration.'); // Removed as we auto-save now
            } catch (err) {
                new Notice(t("settings.integration.error", { error: err }));
                console.error(err);
            }
        };

        updateActionButtons = () => {
            actionsDiv.empty();

            let hasChanges = false;
            if (isNew) {
                hasChanges = true;
            } else {
                const original = this.plugin.settings.notionSyncConfigs.find(c => c.id === config.id);
                if (original) {
                    hasChanges = JSON.stringify(config) !== JSON.stringify(original);
                }
            }

            // Update isDirty status to reflect actual state
            this.isDirty = hasChanges;

            if (hasChanges) {
                const saveBtn = actionsDiv.createEl('button', { text: t("common.save") });
                saveBtn.setAttr('type', 'submit');
                saveBtn.onclick = async () => {
                    let globalToken = "";
                    if ((this.plugin.app as any).secretStorage) {
                        globalToken = await (this.plugin.app as any).secretStorage.getSecret('db-notion-api-key') || "";
                    }
                    if (!config.name || !globalToken || !config.databaseId) {
                        new Notice(t("settings.integration.saveConfigFillFirst"));
                        return;
                    }

                    if (isNew) {
                        this.plugin.settings.notionSyncConfigs.push(config);
                    } else {
                        const idx = this.plugin.settings.notionSyncConfigs.findIndex(c => c.id === config.id);
                        if (idx !== -1) {
                            this.plugin.settings.notionSyncConfigs[idx] = config;
                        }
                    }

                    await this.plugin.saveSettings();
                    new Notice(t("settings.integration.notionConfigSaved"));

                    this.isDirty = false;
                    this.currentEditingConfig = null;

                    // Stay on edit page but update UI
                    this.editingNotionConfigId = config.id;
                    // Need to re-enter edit mode to refresh "isNew" status and UI
                    this.display();

                    // Prompt to update file
                    const safeName = config.name.replace(/[^a-zA-Z0-9]/g, '_') || 'NotionDB';
                    const folder = this.plugin.settings.defaultDbFolder || '';
                    let targetPath = folder ? `${folder}/${safeName}.md` : `${safeName}.md`;
                    targetPath = normalizePath(targetPath);

                    const existingFile = this.plugin.app.vault.getAbstractFileByPath(targetPath);
                    if (existingFile instanceof TFile) {
                        if (confirm(t("settings.integration.updateDbFileConfirm", { path: targetPath }))) {
                            await generateOrUpdateDbFile(config);
                        }
                    } else {
                        // File doesn't exist, maybe ask to create?
                        if (confirm(t("settings.integration.generateDbFileConfirm", { path: targetPath }))) {
                            await generateOrUpdateDbFile(config);
                        }
                    }
                };
            } else {
                const hasTarget = !!config.targetDbPath;

                if (hasTarget) {
                    const targetRow = actionsDiv.createDiv();
                    targetRow.style.display = 'flex';
                    targetRow.style.alignItems = 'center';
                    targetRow.style.gap = '8px';
                    targetRow.style.flex = '1';

                    const targetLabel = targetRow.createEl('span', { text: t("settings.integration.targetLabel") });
                    targetLabel.style.color = 'var(--text-muted)';
                    targetLabel.style.whiteSpace = 'nowrap';

                    const targetInput = targetRow.createEl('input', { type: 'text', placeholder: t("settings.integration.targetPlaceholder") });
                    targetInput.value = config.targetDbPath;
                    targetInput.style.flex = '1';
                    targetInput.disabled = true;
                    new FileSuggest(this.plugin.app, targetInput);

                    const editBtn = actionsDiv.createEl('button', { text: t("common.edit") });
                    editBtn.onclick = () => {
                        targetInput.disabled = false;
                        targetInput.focus();
                        editBtn.style.display = 'none';
                        updateBtn.style.display = 'inline-flex';
                    };

                    const updateBtn = actionsDiv.createEl('button', { text: t("common.update") });
                    updateBtn.style.display = 'none';
                    updateBtn.onclick = async () => {
                        const newPath = targetInput.value.trim();
                        if (newPath && newPath !== config.targetDbPath) {
                            config.targetDbPath = newPath;
                            const idx = this.plugin.settings.notionSyncConfigs.findIndex(c => c.id === config.id);
                            if (idx !== -1) {
                                this.plugin.settings.notionSyncConfigs[idx].targetDbPath = newPath;
                            }
                            await this.plugin.saveSettings();
                            new Notice(t("settings.integration.targetDbUpdated", { path: config.targetDbPath }));
                        }
                        targetInput.disabled = true;
                        editBtn.style.display = 'inline-flex';
                        updateBtn.style.display = 'none';
                    };
                } else {
                    const genBtn = actionsDiv.createEl('button', { text: t("common.generate") });
                    genBtn.setAttribute('aria-label', t("settings.integration.generateAria"));

                    genBtn.onclick = async () => {
                        await generateOrUpdateDbFile(config);
                    };
                }
            }
        };

        updateActionButtons();
    }
}
