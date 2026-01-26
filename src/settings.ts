import {App, PluginSettingTab, setIcon, Setting} from "obsidian";
import MyPlugin from "./main";

export interface MarkdownDBSettings {
    knownProperties: string[];
    propertyValues: Record<string, string[]>;
    blockStyleProperties: string[];
    defaultDbFolder: string;
    lastOpenedDbPath?: string;
}

export const DEFAULT_SETTINGS: MarkdownDBSettings = {
    knownProperties: [],
    propertyValues: {},
    blockStyleProperties: [],
    defaultDbFolder: ""
}

export class MarkdownDBSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    selectedProperty: string | null = null;

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
            .addText(text => text
                .setPlaceholder('Example: Databases')
                .setValue(this.plugin.settings.defaultDbFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultDbFolder = value;
                    await this.plugin.saveSettings();
                }));

        const mainContainer = containerEl.createDiv({ cls: 'markdown-db-settings-container' });

        // --- Left Pane: Property List ---
        const leftPane = mainContainer.createDiv({ cls: 'markdown-db-settings-sidebar' });

        // Add Property Header (Sticky Top)
        const addPropHeader = leftPane.createDiv({ cls: 'markdown-db-settings-sidebar-header' });
        
        const addPropInputContainer = addPropHeader.createDiv({ cls: 'markdown-db-input-group' });
        
        const propInput = addPropInputContainer.createEl("input", {type: "text"});
        propInput.placeholder = "New property...";
        propInput.style.flex = "1";

        const propAddBtn = addPropInputContainer.createEl("button", { cls: "mod-cta" });
        setIcon(propAddBtn, "plus");
        
        const handleAddProp = async () => {
            const val = propInput.value.trim();
            if (val && !this.plugin.settings.knownProperties.includes(val)) {
                this.plugin.settings.knownProperties.push(val);
                this.plugin.settings.propertyValues[val] = [];
                this.selectedProperty = val; // Auto-select new property
                await this.plugin.saveSettings();
                propInput.value = "";
                this.display();
            }
        };

        propAddBtn.onclick = handleAddProp;
        propInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleAddProp();
        });

        // Property List (Scrollable)
        const propList = leftPane.createDiv({ cls: 'markdown-db-settings-list' });

        this.plugin.settings.knownProperties.forEach((prop, index) => {
            const propItem = propList.createDiv({ cls: 'markdown-db-settings-item' });
            
            if (this.selectedProperty === prop) {
                propItem.classList.add('is-selected');
            }

            propItem.createSpan({text: prop});

            const deleteBtn = propItem.createEl("button", { cls: 'markdown-db-settings-item-delete' });
            setIcon(deleteBtn, "trash");
            deleteBtn.title = "Delete Property";
            
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                // Simple confirmation could be added here if needed
                this.plugin.settings.knownProperties.splice(index, 1);
                delete this.plugin.settings.propertyValues[prop];
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
            const iconContainer = emptyState.createDiv({ style: "margin-bottom: 16px; opacity: 0.5;" });
            setIcon(iconContainer, "layout-list"); 
            // Scale up the icon
            iconContainer.querySelector("svg")?.setAttribute("width", "48");
            iconContainer.querySelector("svg")?.setAttribute("height", "48");
            
            emptyState.createDiv({
                text: "Select a property to manage its values.",
                style: "font-size: 1.1em;"
            });
        } else {
            const prop = this.selectedProperty;

            new Setting(rightPane)
                .setName(prop)
                .setDesc("Render as Block")
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.blockStyleProperties?.includes(prop) || false)
                    .onChange(async (value) => {
                        if (!this.plugin.settings.blockStyleProperties) {
                            this.plugin.settings.blockStyleProperties = [];
                        }
                        
                        if (value) {
                            if (!this.plugin.settings.blockStyleProperties.includes(prop)) {
                                this.plugin.settings.blockStyleProperties.push(prop);
                            }
                        } else {
                            this.plugin.settings.blockStyleProperties = this.plugin.settings.blockStyleProperties.filter(p => p !== prop);
                        }
                        await this.plugin.saveSettings();
                    }));

            rightPane.createDiv({
                style: "border-bottom: 1px solid var(--background-modifier-border); margin-bottom: 20px;"
            });

            // const header = rightPane.createDiv({ cls: 'markdown-db-header-title' });
            // header.setText(prop); // Just show the property name as title

            // Add Value Input
            // const addValContainer = rightPane.createDiv({ cls: 'markdown-db-input-group' });

            // const valInput = addValContainer.createEl("input", {type: "text"});
            // valInput.placeholder = "Add new value...";
            // valInput.style.flex = "1";
            
            // const valAddBtn = addValContainer.createEl("button", {text: "Add Value", cls: "mod-cta"});
            // valAddBtn.onclick = async () => {
            //     const val = valInput.value.trim();
            //     const currentVals = this.plugin.settings.propertyValues[prop] || [];
            //     if (val && !currentVals.includes(val)) {
            //         if (!this.plugin.settings.propertyValues[prop]) {
            //             this.plugin.settings.propertyValues[prop] = [];
            //         }
            //         this.plugin.settings.propertyValues[prop].push(val);
            //         await this.plugin.saveSettings();
            //         valInput.value = "";
            //         this.display();
            //     }
            // };
            // // Allow Enter key to add
            // valInput.addEventListener("keypress", (e) => {
            //     if (e.key === "Enter") {
            //         valAddBtn.click();
            //     }
            // });

            // Values List
            const valuesList = rightPane.createDiv({ cls: 'markdown-db-value-list' });
            const currentValues = this.plugin.settings.propertyValues[prop] || [];

            if (currentValues.length === 0) {
                valuesList.createDiv({text: "No values saved yet.", style: "color: var(--text-faint); padding: 10px; font-style: italic;"});
            } else {
                currentValues.forEach((val, index) => {
                    const valItem = valuesList.createDiv({ cls: 'markdown-db-value-item' });

                    valItem.createSpan({text: val});

                    const removeValBtn = valItem.createEl("button", { cls: 'markdown-db-settings-item-delete' });
                    // Override styles for always visible or different look if needed, but reusing is fine
                    removeValBtn.style.opacity = "0.6"; 
                    removeValBtn.onmouseenter = () => removeValBtn.style.opacity = "1";
                    removeValBtn.onmouseleave = () => removeValBtn.style.opacity = "0.6";

                    setIcon(removeValBtn, "x");
                    removeValBtn.title = "Remove Value";
                    
                    removeValBtn.onclick = async () => {
                        this.plugin.settings.propertyValues[prop].splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    };
                });
            }
        }
    }
}
