import {App, PluginSettingTab, setIcon, Setting, Menu, TFile} from "obsidian";
import MyPlugin from "./main";
import { FolderSuggest } from "./suggest/suggest";
import { PropertyType, PROPERTY_TYPE_ICONS, VALID_PROPERTY_TYPES } from "./database/schema";
import { addCssClassToFiles, removeCssClassFromFiles, HIDDEN_CSS_CLASS } from "./database/writer";
import { PropertySettingsView } from "./settings/PropertySettings";
import { IntegrationSettingsView } from "./settings/IntegrationSettings";

export interface PropertyConfig {
    name: string;
    type: PropertyType;
    values: string[];
    ignoredValues: string[];
}

export interface NotionPropertyConfig {
    name: string;
    type: string;
}

export interface NotionSyncConfig {
    id: string;
    name: string;
    databaseId: string;
    targetDbPath: string;
    properties: NotionPropertyConfig[];
    syncDirection: 'push' | 'pull';
    autoSyncOnStartup: boolean;
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

    // Notion Sync Settings
    notionApiKey: string;
    notionSyncConfigs: NotionSyncConfig[];
}

export const DEFAULT_SETTINGS: MarkdownDBSettings = {
    properties: [],
    defaultDbFolder: "",
    hideProperties: false,
    autoSyncGithub: false,
    githubUsername: "",
    githubToken: "",
    githubSyncStarsDb: "",
    githubSyncPrsDb: "",
    notionApiKey: "",
    notionSyncConfigs: []
}

export class MarkdownDBSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    activeTab: 'general' | 'properties' | 'integration' = 'general';
    propertySettingsView: PropertySettingsView;
    integrationSettingsView: IntegrationSettingsView;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.propertySettingsView = new PropertySettingsView(plugin);
        this.integrationSettingsView = new IntegrationSettingsView(plugin);
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

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
            text: 'Properties'
        });
        propTab.onclick = () => {
            this.activeTab = 'properties';
            this.display();
        };

        const integrationTab = tabHeader.createDiv({ 
            cls: `markdown-db-settings-tab ${this.activeTab === 'integration' ? 'is-active' : ''}`,
            text: 'Integration'
        });
        integrationTab.onclick = () => {
            this.activeTab = 'integration';
            this.display();
        };

        // Content
        if (this.activeTab === 'general') {
            this.renderGeneralSettings(containerEl);
        } else if (this.activeTab === 'properties') {
            this.propertySettingsView.mount(containerEl);
        } else {
            this.integrationSettingsView.mount(containerEl);
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
    }
}
