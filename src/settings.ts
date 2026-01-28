import {App, PluginSettingTab, setIcon, Setting, Menu, TFile} from "obsidian";
import MyPlugin from "./main";
import { FolderSuggest } from "./suggest/suggest";
import { PropertyType, PROPERTY_TYPE_ICONS, VALID_PROPERTY_TYPES } from "./database/schema";
import { addCssClassToFiles, removeCssClassFromFiles, HIDDEN_CSS_CLASS } from "./database/writer";

export interface PropertyConfig {
    name: string;
    type: PropertyType;
    values: string[];
    ignoredValues: string[];
}

export interface MarkdownDBSettings {
    properties: PropertyConfig[];
    defaultDbFolder: string;
    lastOpenedDbPath?: string;
    hideProperties: boolean;
    
    // Github Auto-Sync Settings
    autoSyncGithub: boolean;
    githubUsername: string;
    githubToken: string;
    githubSyncTargetDb: string;
    
    // Deprecated fields (kept for migration types, can be optional or handled via casting in main.ts)
    // We remove them from the interface to force update, but we'll cast `any` during migration.
}

export const DEFAULT_SETTINGS: MarkdownDBSettings = {
    properties: [],
    defaultDbFolder: "",
    hideProperties: false,
    autoSyncGithub: false,
    githubUsername: "",
    githubToken: "",
    githubSyncTargetDb: ""
}

export class MarkdownDBSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    selectedProperty: string | null = null;
    filterType: PropertyType | 'all' = 'all';
    searchQuery: string = "";

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();
        containerEl.createEl('h2', {text: 'Markdown DB Settings'});

        // General Settings
        new Setting(containerEl)
            .setName('Default DB Folder')
            .setDesc('Folder path to create new DB files in (e.g. "Databases"). Leave empty for root.')
            .addText(text => {
                new FolderSuggest(this.app, text.inputEl);
                text
                    .setPlaceholder('Example: Databases')
                    .setValue(this.plugin.settings.defaultDbFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultDbFolder = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Hide DB Properties')
            .setDesc('Hide lines wrapped in %% %% in the editor for DB files.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideProperties)
                .onChange(async (value) => {
                    this.plugin.settings.hideProperties = value;
                    await this.plugin.saveSettings();
                    
                    // Identify all DB files
                    const dbFiles = this.app.vault.getMarkdownFiles().filter(file => {
                         const cache = this.app.metadataCache.getFileCache(file);
                         return cache?.frontmatter?.['markdown-db'] === true || cache?.frontmatter?.['markdown-db'] === 'true';
                    });

                    if (value) {
                         await addCssClassToFiles(this.app, dbFiles, HIDDEN_CSS_CLASS);
                    } else {
                         await removeCssClassFromFiles(this.app, dbFiles, HIDDEN_CSS_CLASS);
                    }
                }));

        containerEl.createEl('h2', {text: 'Github Auto-Sync'});

        new Setting(containerEl)
            .setName('Enable Auto-Sync')
            .setDesc('Automatically fetch Github stars on Obsidian startup.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSyncGithub)
                .onChange(async (value) => {
                    this.plugin.settings.autoSyncGithub = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide dependent settings
                }));

        if (this.plugin.settings.autoSyncGithub) {
            new Setting(containerEl)
                .setName('Github Username')
                .addText(text => text
                    .setValue(this.plugin.settings.githubUsername)
                    .onChange(async (value) => {
                        this.plugin.settings.githubUsername = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Github Token (Optional)')
                .setDesc('Required for private repos or to avoid rate limits.')
                .addText(text => text
                    .setPlaceholder('ghp_...')
                    .setValue(this.plugin.settings.githubToken)
                    .onChange(async (value) => {
                        this.plugin.settings.githubToken = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Target Database')
                .setDesc('Select the database file to save stars to.')
                .addDropdown(dropdown => {
                    const files = this.app.vault.getMarkdownFiles().filter(file => {
                        const cache = this.app.metadataCache.getFileCache(file);
                        return cache?.frontmatter?.['markdown-db'] === true || cache?.frontmatter?.['markdown-db'] === 'true';
                    });

                    if (files.length === 0) {
                        dropdown.addOption("", "No databases found");
                    } else {
                        files.sort((a, b) => a.path.localeCompare(b.path));
                        files.forEach((file) => {
                            dropdown.addOption(file.path, file.path);
                        });
                    }

                    dropdown.setValue(this.plugin.settings.githubSyncTargetDb);
                    dropdown.onChange(async (value) => {
                        this.plugin.settings.githubSyncTargetDb = value;
                        await this.plugin.saveSettings();
                    });
                });
        }

        containerEl.createEl('h2', {text: 'Properties Manage'});

        const mainContainer = containerEl.createDiv({ cls: 'markdown-db-settings-container' });

        // --- Left Pane: Property List ---
        const leftPane = mainContainer.createDiv({ cls: 'markdown-db-settings-sidebar' });

        // Add Property Header (Sticky Top)
        const addPropHeader = leftPane.createDiv({ cls: 'markdown-db-settings-sidebar-header' });
        
        const addPropInputContainer = addPropHeader.createDiv({ cls: 'markdown-db-input-group' });

        const propInput = addPropInputContainer.createEl("input", {type: "text"});
        propInput.placeholder = "Search properties...";
        propInput.value = this.searchQuery;
        propInput.style.flex = "1";

        // Property List (Scrollable)
        const propList = leftPane.createDiv({ cls: 'markdown-db-settings-list' });

        propInput.addEventListener("input", (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            const query = this.searchQuery.toLowerCase();
            
            const items = propList.querySelectorAll('.markdown-db-settings-item');
            items.forEach((item) => {
                const text = item.textContent || "";
                if (text.toLowerCase().includes(query)) {
                    (item as HTMLElement).style.display = "flex";
                } else {
                    (item as HTMLElement).style.display = "none";
                }
            });
        });

        // Filter Button
        const filterBtn = addPropInputContainer.createEl("button", { cls: "clickable-icon" });
        filterBtn.style.marginRight = "8px";
        filterBtn.style.background = "transparent";
        filterBtn.style.border = "none";
        filterBtn.style.padding = "4px";
        filterBtn.style.cursor = "pointer";
        filterBtn.style.display = "flex";
        filterBtn.style.alignItems = "center";
        
        const filterIconName = this.filterType === 'all' ? "filter" : PROPERTY_TYPE_ICONS[this.filterType];
        setIcon(filterBtn, filterIconName);
        filterBtn.title = this.filterType === 'all' ? "Filter by Type" : `Filter: ${this.filterType}`;

        filterBtn.onclick = (e) => {
            const menu = new Menu();
            
            menu.addItem((item) => {
                item.setTitle("All Types")
                    .setIcon("filter")
                    .setChecked(this.filterType === 'all')
                    .onClick(() => {
                        this.filterType = 'all';
                        this.display();
                    });
            });

            menu.addSeparator();

            VALID_PROPERTY_TYPES.forEach(type => {
                menu.addItem((item) => {
                    item.setTitle(type.charAt(0).toUpperCase() + type.slice(1))
                        .setIcon(PROPERTY_TYPE_ICONS[type])
                        .setChecked(this.filterType === type)
                        .onClick(() => {
                            this.filterType = type;
                            this.display();
                        });
                });
            });

            const rect = filterBtn.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left, y: rect.bottom + 5 });
        };

        this.plugin.settings.properties.forEach((propConfig, index) => {
            const prop = propConfig.name;
            const type = propConfig.type;

            if (this.filterType !== 'all' && type !== this.filterType) {
                return;
            }

            const propItem = propList.createDiv({ cls: 'markdown-db-settings-item' });
            if (this.searchQuery && !prop.toLowerCase().includes(this.searchQuery.toLowerCase())) {
                propItem.style.display = "none";
            }
            
            if (this.selectedProperty === prop) {
                propItem.classList.add('is-selected');
            }

            const labelContainer = propItem.createDiv();
            labelContainer.style.display = "flex";
            labelContainer.style.alignItems = "center";
            labelContainer.style.flex = "1";
            labelContainer.style.overflow = "hidden"; // Prevent text overflow issues

            // 图标与文字紧挨，靠左显示
            const iconSpan = labelContainer.createSpan({ cls: 'markdown-db-settings-item-icon' });
            iconSpan.style.display = "inline-flex";
            iconSpan.style.alignItems = "center";
            iconSpan.style.marginRight = "6px";
            iconSpan.style.color = "var(--text-muted)";
            iconSpan.style.flexShrink = "0";
            iconSpan.style.width = "16px";
            iconSpan.style.height = "16px";
            setIcon(iconSpan, PROPERTY_TYPE_ICONS[type]);

            // 文字
            const textSpan = labelContainer.createSpan({text: prop});
            textSpan.style.textAlign = "left";
            textSpan.style.whiteSpace = "nowrap";
            textSpan.style.overflow = "hidden";
            textSpan.style.textOverflow = "ellipsis";

            const deleteBtn = propItem.createEl("button", { cls: 'markdown-db-settings-item-delete' });
            setIcon(deleteBtn, "trash");
            deleteBtn.title = "Delete Property";
            
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                
                this.plugin.settings.properties.splice(index, 1);
                
                if (this.selectedProperty === prop) {
                    this.selectedProperty = null;
                }
                await this.plugin.saveSettings();
                this.display();
            };
            
            propItem.onclick = () => {
                this.selectedProperty = prop;
                this.display();
            };
        });

        // --- Right Pane: Value Management ---
        const rightPane = mainContainer.createDiv({ cls: 'markdown-db-settings-content' });

        if (!this.selectedProperty) {
            const emptyState = rightPane.createDiv({ cls: 'markdown-db-empty-state' });
            const iconContainer = emptyState.createDiv();
            setIcon(iconContainer, "layout-list"); 
            // Scale up the icon
            iconContainer.querySelector("svg")?.setAttribute("width", "48");
            iconContainer.querySelector("svg")?.setAttribute("height", "48");
            
            emptyState.createDiv({
                text: "Select a property to manage its values.",
            });
        } else {
            const prop = this.selectedProperty;
            const propConfig = this.plugin.settings.properties.find(p => p.name === prop);
            
            if (propConfig) {
                rightPane.createDiv();

                // Values List
                const valuesList = rightPane.createDiv({ cls: 'markdown-db-value-list' });
                const currentValues = propConfig.values || [];

                if (currentValues.length === 0) {
                    valuesList.createDiv({text: "No values saved yet."});
                } else {
                    currentValues.forEach((val, index) => {
                        const valItem = valuesList.createDiv({ cls: 'markdown-db-value-item' });

                        valItem.createSpan({text: val});

                        const removeValBtn = valItem.createEl("button", { cls: 'markdown-db-settings-item-delete' });
                        removeValBtn.style.opacity = "0.6"; 
                        removeValBtn.onmouseenter = () => removeValBtn.style.opacity = "1";
                        removeValBtn.onmouseleave = () => removeValBtn.style.opacity = "0.6";

                        setIcon(removeValBtn, "x");
                        removeValBtn.title = "Remove Value";
                        
                        removeValBtn.onclick = async () => {
                            // Remove from active values
                            propConfig.values.splice(index, 1);
                            
                            // Add to ignored list
                            if (!propConfig.ignoredValues) {
                                propConfig.ignoredValues = [];
                            }
                            if (!propConfig.ignoredValues.includes(val)) {
                                propConfig.ignoredValues.push(val);
                            }

                            await this.plugin.saveSettings();
                            this.display();
                        };
                    });
                }

                // Ignored Values Section
                const ignoredValues = propConfig.ignoredValues || [];
                if (ignoredValues.length > 0) {
                     rightPane.createDiv({
                         text: "Ignored Values (Hidden from suggestions)",
                         cls: "markdown-db-section-header",
                         attr: { style: "margin-top: 20px; font-weight: bold; font-size: 0.9em; color: var(--text-muted);" }
                     });

                     const ignoredList = rightPane.createDiv({ cls: 'markdown-db-value-list', attr: { style: "opacity: 0.7;" } });
                     
                     ignoredValues.forEach((val, index) => {
                         const valItem = ignoredList.createDiv({ cls: 'markdown-db-value-item' });
                         valItem.createSpan({text: val, attr: { style: "text-decoration: line-through; color: var(--text-muted);" }});

                         const restoreBtn = valItem.createEl("button", { cls: 'markdown-db-settings-item-delete' });
                         setIcon(restoreBtn, "undo");
                         restoreBtn.title = "Restore Value";
                         
                         restoreBtn.onclick = async () => {
                             // Remove from ignored
                             propConfig.ignoredValues.splice(index, 1);
                             
                             // Add back to active values if not already present
                             if (!propConfig.values.includes(val)) {
                                 propConfig.values.push(val);
                                 propConfig.values.sort();
                             }

                             await this.plugin.saveSettings();
                             this.display();
                         };
                     });
                }
            }
        }
    }
}
