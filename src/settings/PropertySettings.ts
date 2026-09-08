import { setIcon, Menu, Notice } from "obsidian";
import type MarkdownDBPlugin from "../main";
import { PropertyType, PROPERTY_TYPE_ICONS, VALID_PROPERTY_TYPES } from "../database/schema";
import { t } from "../i18n";

export class PropertySettingsView {
    plugin: MarkdownDBPlugin;
    container: HTMLElement | null = null;
    selectedProperty: string | null = null;
    filterType: PropertyType | 'all' = 'all';
    searchQuery: string = "";

    constructor(plugin: MarkdownDBPlugin) {
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

        const headerContainer = containerEl.createDiv();
        headerContainer.style.display = "flex";
        headerContainer.style.justifyContent = "space-between";
        headerContainer.style.alignItems = "center";
        // Ensure header doesn't have huge bottom margin pushing content down, 
        // but container might need some.
        headerContainer.style.marginBottom = "10px";

        headerContainer.createEl('h2', {text: t("settings.properties.title"), attr: { style: 'margin: 0;' }});

        const scanBtn = headerContainer.createEl('button');
        scanBtn.setText(t("settings.properties.rescan"));
        scanBtn.setAttr("aria-label", t("settings.properties.rescanAria"));

        scanBtn.onclick = async () => {
             scanBtn.disabled = true;
             scanBtn.setText(t("settings.properties.scanning"));
             new Notice(t("settings.properties.scanningNotice"));
             await this.plugin.scanAllDatabaseFiles();
             new Notice(t("settings.properties.scanComplete"));
             scanBtn.disabled = false;
             scanBtn.setText(t("settings.properties.rescanProperties"));
             this.display();
        };

        const mainContainer = containerEl.createDiv({ cls: 'markdown-db-settings-container' });

        // --- Left Pane: Property List ---
        const leftPane = mainContainer.createDiv({ cls: 'markdown-db-settings-sidebar' });

        // Add Property Header (Sticky Top)
        const addPropHeader = leftPane.createDiv({ cls: 'markdown-db-settings-sidebar-header' });
        
        const addPropInputContainer = addPropHeader.createDiv({ cls: 'markdown-db-input-group' });

        const propInput = addPropInputContainer.createEl("input", {type: "text"});
        propInput.placeholder = t("settings.properties.searchPlaceholder");
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
        filterBtn.title = this.filterType === 'all' ? t("settings.properties.filterByType") : t("settings.properties.filterWith", { type: t(`propertyTypes.${this.filterType}`) });

        filterBtn.onclick = (e) => {
            const menu = new Menu();
            
            menu.addItem((item) => {
                item.setTitle(t("settings.properties.allTypes"))
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
                    item.setTitle(t(`propertyTypes.${type}`))
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
            deleteBtn.title = t("settings.properties.deleteProperty");
            
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
                text: t("settings.properties.selectPropertyToManage"),
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
                    valuesList.createDiv({text: t("settings.properties.noValuesYet")});
                } else {
                    currentValues.forEach((val, index) => {
                        const valItem = valuesList.createDiv({ cls: 'markdown-db-value-item' });

                        valItem.createSpan({text: val});

                        const removeValBtn = valItem.createEl("button", { cls: 'markdown-db-settings-item-delete' });
                        removeValBtn.style.opacity = "0.6"; 
                        removeValBtn.onmouseenter = () => removeValBtn.style.opacity = "1";
                        removeValBtn.onmouseleave = () => removeValBtn.style.opacity = "0.6";

                        setIcon(removeValBtn, "x");
                        removeValBtn.title = t("settings.properties.removeValue");
                        
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
                         text: t("settings.properties.ignoredValuesTitle"),
                         cls: "markdown-db-section-header",
                         attr: { style: "margin-top: 20px; font-weight: bold; font-size: 0.9em; color: var(--text-muted);" }
                     });

                     const ignoredList = rightPane.createDiv({ cls: 'markdown-db-value-list', attr: { style: "opacity: 0.7;" } });
                     
                     ignoredValues.forEach((val, index) => {
                         const valItem = ignoredList.createDiv({ cls: 'markdown-db-value-item' });
                         valItem.createSpan({text: val, attr: { style: "text-decoration: line-through; color: var(--text-muted);" }});

                         const restoreBtn = valItem.createEl("button", { cls: 'markdown-db-settings-item-delete' });
                         setIcon(restoreBtn, "undo");
                         restoreBtn.title = t("settings.properties.restoreValue");
                         
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
