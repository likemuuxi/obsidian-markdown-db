import { App, Modal, Setting, Notice, TFile, TFolder } from "obsidian";
import { FolderSuggest } from "../suggest/suggest";
import type MarkdownDBPlugin from "../main";
import {
    fetchGithubStars,
    fetchGithubPRs,
    formatStarToMarkdown,
    formatPRToMarkdown,
    mergeMarkdownContent
} from "../utils/github-api";
import { t } from "../i18n";

export class ImportModal extends Modal {
    sourceType: "obsidian" | "github-stars" | "github-pull" = "obsidian";

    // Obsidian Source State
    folderPath: string = "";
    folderSuggest: FolderSuggest | null = null;

    // Github Source State
    githubUsername: string = "";
    githubToken: string = "";

    // Destination State
    mode: "new" | "append" = "new";
    dbName: string = "";
    existingDbPath: string = "";

    plugin: MarkdownDBPlugin;

    constructor(app: App, plugin: MarkdownDBPlugin) {
        super(app);
        this.plugin = plugin;
        this.githubUsername = this.plugin.settings.githubUsername || "";
    }

    onOpen() {
        if ((this.plugin.app as any).secretStorage) {
            const token = (this.plugin.app as any).secretStorage.getSecret("db-github-token");
            if (token) this.githubToken = token;
            this.display();
        } else {
            this.display();
        }
    }

    onClose() {
        this.teardown();
        const { contentEl } = this;
        contentEl.empty();
    }

    teardown() {
        if (this.folderSuggest) {
            this.folderSuggest.destroy();
            this.folderSuggest = null;
        }
    }

    display() {
        this.teardown();
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: t("modals.import.title") });

        // 1. Source Type Selection
        new Setting(contentEl)
            .setName(t("modals.import.sourceType"))
            .setDesc(t("modals.import.sourceTypeDesc"))
            .addDropdown((dropdown) => {
                dropdown.addOption("obsidian", t("modals.import.sourceFolder"));
                dropdown.addOption("github-stars", t("modals.import.githubStars"));
                dropdown.addOption("github-pull", t("modals.import.githubPrs"));
                dropdown.setValue(this.sourceType);
                dropdown.onChange((value) => {
                    this.sourceType = value as "obsidian" | "github-stars" | "github-pull";
                    this.display(); // Refresh to show relevant source options
                });
            });

        // 2. Source Configuration
        if (this.sourceType === "obsidian") {
            this.renderObsidianSource(contentEl);
        } else {
            this.renderGithubSource(contentEl);
        }

        // 3. Destination Configuration
        this.renderDestination(contentEl);

        // 4. Import Button
        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText(t("modals.import.importBtn"))
                    .setCta()
                    .onClick(() => {
                        this.startImport();
                    })
            );
    }

    renderObsidianSource(container: HTMLElement) {
        container.createEl("h3", { text: t("modals.import.settingsSection") });

        new Setting(container)
            .setName(t("modals.import.sourceFolderName"))
            .setDesc(t("modals.import.sourceFolderDesc"))
            .addText((text) => {
                text
                    .setPlaceholder(t("modals.import.sourceFolderPlaceholder"))
                    .setValue(this.folderPath)
                    .onChange((value) => {
                        this.folderPath = value;
                    });

                this.folderSuggest = new FolderSuggest(this.app, text.inputEl);
            });
    }

    renderGithubSource(container: HTMLElement) {
        container.createEl("h3", { text: t("modals.import.settingsSection") });

        new Setting(container)
            .setName(t("settings.integration.githubUsername"))
            .addText((text) =>
                text
                    .setValue(this.githubUsername)
                    .onChange((value) => {
                        this.githubUsername = value;
                    })
            );

        new Setting(container)
            .setName(t("modals.import.githubTokenName"))
            .setDesc(t("modals.import.githubTokenDesc"))
            .addText((text) => {
                text.inputEl.type = "password";
                text
                    .setPlaceholder(t("settings.integration.ghpPlaceholder"))
                    .setValue(this.githubToken)
                    .onChange((value) => {
                        this.githubToken = value;
                    });
            });
    }

    renderDestination(container: HTMLElement) {
        new Setting(container)
            .setName(t("modals.import.importMode"))
            .addDropdown((dropdown) => {
                dropdown.addOption("new", t("modals.import.createNewDb"));
                dropdown.addOption("append", t("modals.import.appendToExisting"));
                dropdown.setValue(this.mode);
                dropdown.onChange((value) => {
                    this.mode = value as "new" | "append";
                    this.display();
                });
            });

        if (this.mode === "new") {
            new Setting(container)
                .setName(t("modals.import.newDbName"))
                .addText((text) =>
                    text
                        .setValue(this.dbName)
                        .onChange((value) => {
                            this.dbName = value;
                        })
                );
        } else {
            new Setting(container)
                .setName(t("modals.import.existingDbPath"))
                .setDesc(t("modals.import.existingDbPathDesc"))
                .addDropdown((dropdown) => {
                    const files = this.app.vault.getMarkdownFiles().filter(file => {
                        const cache = this.app.metadataCache.getFileCache(file);
                        return cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
                    });

                    if (files.length === 0) {
                        dropdown.addOption("", t("modals.import.noDatabases"));
                    } else {
                        // Sort files by path for better UX
                        files.sort((a, b) => a.path.localeCompare(b.path));

                        files.forEach((file) => {
                            dropdown.addOption(file.path, file.path);
                        });

                        // Set default value if existingDbPath is empty or invalid
                        if (!this.existingDbPath || !files.some(f => f.path === this.existingDbPath)) {
                            this.existingDbPath = files[0].path;
                        }
                    }

                    dropdown.setValue(this.existingDbPath);
                    dropdown.onChange((value) => {
                        this.existingDbPath = value;
                    });
                });
        }
    }

    async startImport() {
        if (this.mode === "new" && !this.dbName) {
            new Notice(t("modals.import.dbNameRequired"));
            return;
        }

        if (this.mode === "append" && !this.existingDbPath) {
            new Notice(t("modals.import.existingPathRequired"));
            return;
        }

        if (this.sourceType === "obsidian") {
            if (!this.folderPath) {
                new Notice(t("modals.import.sourceFolderRequired"));
                return;
            }
            await this.importFromObsidian();
        } else {
            if (!this.githubUsername) {
                new Notice(t("modals.import.githubUsernameRequired"));
                return;
            }
            if (this.sourceType === "github-stars") {
                await this.importFromGithub();
            } else {
                await this.importFromGithubPR();
            }
        }
    }

    async saveToDatabase(contentToAppend: string, report: { total: number, skipped?: number, updated?: number }, isFullContent: boolean = false) {
        if (contentToAppend === "") {
            if (report.skipped && report.skipped === report.total && report.total > 0) {
                new Notice(t("modals.import.allDuplicates"));
            } else if (report.total === 0) {
                new Notice(t("modals.import.noItemsFound"));
            }
            return;
        }

        if (this.mode === "new") {
            const fileName = `${this.dbName}.md`;
            const header = `---\nmarkdown-db: true\n---\n\n# ${this.dbName}\n\n`;
            await this.app.vault.create(fileName, header + contentToAppend);
            new Notice(t("modals.import.dbCreated", { name: fileName }));
        } else {
            const file = this.app.vault.getAbstractFileByPath(this.existingDbPath);
            if (file && file instanceof TFile) {
                if (isFullContent) {
                    await this.app.vault.modify(file, contentToAppend);
                    new Notice(t("modals.import.importedItems", { total: report.total, name: file.basename, updated: report.updated || 0, new: report.total - (report.updated || 0) }));
                } else {
                    await this.app.vault.process(file, (data) => {
                        return data + "\n" + contentToAppend;
                    });
                    new Notice(t("modals.import.importedSkipped", { total: report.total - (report.skipped || 0), name: file.basename, skipped: report.skipped || 0 }));
                }
            } else {
                throw new Error("Existing database file not found: " + this.existingDbPath);
            }
        }
    }

    // ==========================================
    // Obsidian Import Logic
    // ==========================================

    async importFromObsidian() {
        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            new Notice(t("modals.import.invalidFolderPath"));
            return;
        }

        this.close();
        new Notice(t("modals.import.startingFolderImport", { path: this.folderPath }));

        try {
            const files = folder.children.filter((f): f is TFile => f instanceof TFile && f.extension === "md");

            // Read existing content if appending
            let existingContent = "";
            if (this.mode === "append" && this.existingDbPath) {
                const file = this.app.vault.getAbstractFileByPath(this.existingDbPath);
                if (file && file instanceof TFile) {
                    existingContent = await this.app.vault.read(file);
                }
            }

            let contentToAppend = "";
            let skippedCount = 0;
            const ignoredColumns = new Set(["cssclasses", "foldernote", "position"]);

            for (const file of files) {
                const title = file.basename;

                // Deduplication check: check if Title (Name) already exists in content
                const titleRegex = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
                if (existingContent && titleRegex.test(existingContent)) {
                    skippedCount++;
                    continue;
                }

                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;
                const fileContent = await this.app.vault.read(file);

                contentToAppend += `## ${title}\n`;

                const propsParts: string[] = [];

                if (frontmatter) {
                    const keys = Object.keys(frontmatter).filter(k => !ignoredColumns.has(k.toLowerCase()));

                    for (const key of keys) {
                        let val = frontmatter[key];
                        if (val === undefined || val === null) continue;

                        const dbType = this.inferType(val);

                        // Format value
                        let valStr = "";
                        if (Array.isArray(val)) {
                            valStr = val.join(",");
                        } else if (typeof val === 'object') {
                            valStr = JSON.stringify(val);
                        } else {
                            valStr = String(val);
                        }

                        // Special handling for boolean
                        if (dbType === "boolean") {
                            valStr = String(val);
                        }

                        propsParts.push(`[${key}::${dbType}(${valStr})]`);
                    }
                }

                if (propsParts.length > 0) {
                    contentToAppend += `%%\n${propsParts.join("\n")}\n%%\n\n`;
                } else {
                    contentToAppend += `\n`;
                }

                // Process Body Content
                // Strip frontmatter
                const mainContent = fileContent.replace(/^---\n[\s\S]*?\n---\n/, "").trim();

                if (mainContent) {
                    // Shift headers: # -> ###, ## -> ####
                    const shiftedContent = mainContent.replace(/^(#+)/gm, "##$1");
                    contentToAppend += shiftedContent + "\n\n";
                } else {
                    contentToAppend += "\n";
                }
            }

            await this.saveToDatabase(contentToAppend, { total: files.length, skipped: skippedCount });

        } catch (error) {
            console.error(error);
            new Notice(t("modals.import.failedToImport", { error: error.message }));
        }
    }

    inferType(value: any): string {
        if (Array.isArray(value)) return "multi";
        if (typeof value === "boolean") return "boolean";
        if (typeof value === "number") return "number";

        if (typeof value === "string") {
            // Check for Date (YYYY-MM-DD or ISO 8601)
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
            // Check for Link [[...]]
            if (/^\[\[.*\]\]$/.test(value)) return "link";
            return "text";
        }
        return "text";
    }

    // ==========================================
    // Github Import Logic
    // ==========================================

    async importFromGithub() {
        this.close();
        new Notice(t("modals.import.startingGithubImport", { user: this.githubUsername }));

        try {
            const stars = await fetchGithubStars(this.githubUsername, this.githubToken);
            new Notice(t("modals.import.fetchedStars", { count: stars.length }));

            // Read existing content if appending
            let existingContent = "";
            if (this.mode === "append" && this.existingDbPath) {
                const file = this.app.vault.getAbstractFileByPath(this.existingDbPath);
                if (file && file instanceof TFile) {
                    existingContent = await this.app.vault.read(file);
                }
            }

            const { fullContent, updatedCount } = mergeMarkdownContent(
                stars,
                formatStarToMarkdown,
                existingContent,
                this.mode === "append" ? 'update' : 'append-only'
            );

            await this.saveToDatabase(
                fullContent,
                { total: stars.length, updated: updatedCount },
                this.mode === "append" // isFullContent
            );

        } catch (e) {
            console.error(e);
            new Notice(t("modals.import.importFailed", { error: e.message }));
        }
    }

    async importFromGithubPR() {
        this.close();
        new Notice(t("modals.import.startingPrImport", { user: this.githubUsername }));

        try {
            const allPrs = await fetchGithubPRs(this.githubUsername, this.githubToken);
            // Filter out closed and unmerged PRs (discarded)
            const prs = allPrs.filter(pr => !(pr.state === 'closed' && !pr.pull_request?.merged_at));

            new Notice(t("modals.import.fetchedPrs", { total: allPrs.length, count: prs.length }));

            // Read existing content if appending
            let existingContent = "";
            if (this.mode === "append" && this.existingDbPath) {
                const file = this.app.vault.getAbstractFileByPath(this.existingDbPath);
                if (file && file instanceof TFile) {
                    existingContent = await this.app.vault.read(file);
                }
            }

            const { fullContent, updatedCount } = mergeMarkdownContent(
                prs,
                formatPRToMarkdown,
                existingContent,
                this.mode === "append" ? 'update' : 'append-only'
            );

            await this.saveToDatabase(
                fullContent,
                { total: prs.length, updated: updatedCount },
                this.mode === "append" // isFullContent
            );

        } catch (e) {
            console.error(e);
            new Notice(t("modals.import.importFailed", { error: e.message }));
        }
    }
}
