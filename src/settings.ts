import { App, PluginSettingTab, setIcon, Setting, Menu, TFile } from "obsidian";
import MyPlugin from "./main";
import { FolderSuggest } from "./suggest/suggest";
import { PropertyType, PROPERTY_TYPE_ICONS, VALID_PROPERTY_TYPES } from "./database/schema";
import { addCssClassToFiles, removeCssClassFromFiles, HIDDEN_CSS_CLASS } from "./database/writer";
import { PropertySettingsView } from "./settings/PropertySettings";
import { IntegrationSettingsView } from "./settings/IntegrationSettings";
import { t } from "./i18n";

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
    lastSyncTime?: string;
}

export interface MarkdownDBSettings {
    properties: PropertyConfig[];
    defaultDbFolder: string;
    hideProperties: boolean;

    // Github Auto-Sync Settings
    autoSyncGithub: boolean;
    githubUsername: string;
    githubSyncStarsDb: string;
    githubSyncPrsDb: string;

    // Notion Sync Settings
    notionSyncConfigs: NotionSyncConfig[];
    templates: string[];
}

export const DEFAULT_SETTINGS: MarkdownDBSettings = {
    properties: [],
    defaultDbFolder: "",
    hideProperties: false,
    autoSyncGithub: false,
    githubUsername: "",
    githubSyncStarsDb: "",
    githubSyncPrsDb: "",
    notionSyncConfigs: [],
    templates: []
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
        const { containerEl } = this;
        containerEl.empty();

        // Tab Header
        const tabHeader = containerEl.createDiv({ cls: 'markdown-db-settings-tabs' });

        const generalTab = tabHeader.createDiv({
            cls: `markdown-db-settings-tab ${this.activeTab === 'general' ? 'is-active' : ''}`,
            text: t("settings.tabGeneral")
        });
        generalTab.onclick = () => {
            this.activeTab = 'general';
            this.display();
        };

        const propTab = tabHeader.createDiv({
            cls: `markdown-db-settings-tab ${this.activeTab === 'properties' ? 'is-active' : ''}`,
            text: t("settings.tabProperties")
        });
        propTab.onclick = () => {
            this.activeTab = 'properties';
            this.display();
        };

        const integrationTab = tabHeader.createDiv({
            cls: `markdown-db-settings-tab ${this.activeTab === 'integration' ? 'is-active' : ''}`,
            text: t("settings.tabIntegration")
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
            .setName(t("settings.general.defaultDbFolderName"))
            .setDesc(t("settings.general.defaultDbFolderDesc"))
            .addText(text => {
                new FolderSuggest(this.app, text.inputEl);
                text
                    .setPlaceholder(t("settings.general.defaultDbFolderPlaceholder"))
                    .setValue(this.plugin.settings.defaultDbFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultDbFolder = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(t("settings.general.hidePropertiesName"))
            .setDesc(t("settings.general.hidePropertiesDesc"))
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
