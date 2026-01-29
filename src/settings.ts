import {App, PluginSettingTab, setIcon, Setting, Menu, TFile} from "obsidian";
import MyPlugin from "./main";
import { FolderSuggest } from "./suggest/suggest";
import { PropertyType, PROPERTY_TYPE_ICONS, VALID_PROPERTY_TYPES } from "./database/schema";
import { addCssClassToFiles, removeCssClassFromFiles, HIDDEN_CSS_CLASS } from "./database/writer";
import { PropertySettingsView } from "./settings/PropertySettings";

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
    githubSyncStarsDb: string;
    githubSyncPrsDb: string;
}

export const DEFAULT_SETTINGS: MarkdownDBSettings = {
    properties: [],
    defaultDbFolder: "",
    hideProperties: false,
    autoSyncGithub: false,
    githubUsername: "",
    githubToken: "",
    githubSyncStarsDb: "",
    githubSyncPrsDb: ""
}

export class MarkdownDBSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    activeTab: 'general' | 'properties' = 'general';
    propertySettingsView: PropertySettingsView;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.propertySettingsView = new PropertySettingsView(plugin);
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'Markdown DB Settings'});

        // Tab Header
        const tabHeader = containerEl.createDiv({ cls: 'markdown-db-settings-tabs' });
        
        const generalTab = tabHeader.createDiv({ 
            cls: `markdown-db-settings-tab ${this.activeTab === 'general' ? 'is-active' : ''}`,
            text: 'General'
        });
        generalTab.onclick = () => {
            this.activeTab = 'general';
            this.display();
        };

        const propTab = tabHeader.createDiv({ 
            cls: `markdown-db-settings-tab ${this.activeTab === 'properties' ? 'is-active' : ''}`,
            text: 'Database Properties'
        });
        propTab.onclick = () => {
            this.activeTab = 'properties';
            this.display();
        };

        // Content
        if (this.activeTab === 'general') {
            this.renderGeneralSettings(containerEl);
        } else {
            this.propertySettingsView.mount(containerEl);
        }
    }

    renderGeneralSettings(containerEl: HTMLElement) {
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
            .setName('Github Username')
            .addText(text => text
                .setValue(this.plugin.settings.githubUsername)
                .onChange(async (value) => {
                    this.plugin.settings.githubUsername = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Github Token')
            .setDesc('Optional, but recommended for private repos and higher rate limits.')
            .addText(text => text
                .setPlaceholder('ghp_...')
                .setValue(this.plugin.settings.githubToken)
                .onChange(async (value) => {
                    this.plugin.settings.githubToken = value;
                    await this.plugin.saveSettings();
                }));

        // DB File Picker for Stars
        new Setting(containerEl)
            .setName('Target Database (Stars)')
            .setDesc('Select the database file to sync Stars into.')
            .addDropdown((dropdown) => {
                const files = this.app.vault.getMarkdownFiles().filter(file => {
                    const cache = this.app.metadataCache.getFileCache(file);
                    return cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
                });

                if (files.length === 0) {
                    dropdown.addOption("", "No databases found");
                } else {
                    files.sort((a, b) => a.path.localeCompare(b.path));
                    files.forEach((file) => {
                        dropdown.addOption(file.path, file.path);
                    });
                    
                    // Default if empty
                    if (!this.plugin.settings.githubSyncStarsDb && files.length > 0) {
                         // Don't auto-set, let user choose
                    }
                }

                dropdown.setValue(this.plugin.settings.githubSyncStarsDb);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.githubSyncStarsDb = value;
                    await this.plugin.saveSettings();
                });
            });

        // DB File Picker for PRs
        new Setting(containerEl)
            .setName('Target Database (PRs)')
            .setDesc('Select the database file to sync PRs into.')
            .addDropdown((dropdown) => {
                const files = this.app.vault.getMarkdownFiles().filter(file => {
                    const cache = this.app.metadataCache.getFileCache(file);
                    return cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
                });

                if (files.length === 0) {
                    dropdown.addOption("", "No databases found");
                } else {
                    files.sort((a, b) => a.path.localeCompare(b.path));
                    files.forEach((file) => {
                        dropdown.addOption(file.path, file.path);
                    });
                }

                dropdown.setValue(this.plugin.settings.githubSyncPrsDb);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.githubSyncPrsDb = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Enable Auto-Sync')
            .setDesc('Automatically fetch Github stars on Obsidian startup.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSyncGithub)
                .onChange(async (value) => {
                    this.plugin.settings.autoSyncGithub = value;
                    await this.plugin.saveSettings();
                }));
    }
}
