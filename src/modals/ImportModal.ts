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
        this.githubToken = this.plugin.settings.githubToken || "";
    }

    onOpen() {
        this.display();
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
        contentEl.createEl("h2", { text: "Import to Database" });

        // 1. Source Type Selection
        new Setting(contentEl)
            .setName("Source Type")
            .setDesc("Choose where to import data from")
            .addDropdown((dropdown) => {
                dropdown.addOption("obsidian", "Obsidian Folder");
                dropdown.addOption("github-stars", "Github Stars");
                dropdown.addOption("github-pull", "Github Pull Requests");
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
                    .setButtonText("Import")
                    .setCta()
                    .onClick(() => {
                        this.startImport();
                    })
            );
    }

    renderObsidianSource(container: HTMLElement) {
        container.createEl("h3", { text: "Settings" });
        
        new Setting(container)
            .setName("Source Folder")
            .setDesc("Select a folder to import markdown files from")
            .addText((text) => {
                text
                    .setPlaceholder("Example: /path/to/folder")
                    .setValue(this.folderPath)
                    .onChange((value) => {
                        this.folderPath = value;
                    });
                
                this.folderSuggest = new FolderSuggest(this.app, text.inputEl);
            });
    }

    renderGithubSource(container: HTMLElement) {
        container.createEl("h3", { text: "Settings" });

        new Setting(container)
            .setName("Github Username")
            .addText((text) =>
                text
                    .setValue(this.githubUsername)
                    .onChange((value) => {
                        this.githubUsername = value;
                    })
            );

        new Setting(container)
            .setName("Github Token (Optional)")
            .setDesc("Required for private repos or to increase rate limits")
            .addText((text) =>
                text
                    .setPlaceholder("ghp_...")
                    .setValue(this.githubToken)
                    .onChange((value) => {
                        this.githubToken = value;
                    })
            );
    }

    renderDestination(container: HTMLElement) {
        new Setting(container)
            .setName("Import Mode")
            .addDropdown((dropdown) => {
                dropdown.addOption("new", "Create New Database");
                dropdown.addOption("append", "Append to Existing Database");
                dropdown.setValue(this.mode);
                dropdown.onChange((value) => {
                    this.mode = value as "new" | "append";
                    this.display();
                });
            });

        if (this.mode === "new") {
            new Setting(container)
                .setName("New Database Name")
                .addText((text) =>
                    text
                        .setValue(this.dbName)
                        .onChange((value) => {
                            this.dbName = value;
                        })
                );
        } else {
            new Setting(container)
                .setName("Existing Database Path")
                .setDesc("Select an existing database file")
                .addDropdown((dropdown) => {
                    const files = this.app.vault.getMarkdownFiles().filter(file => {
                        const cache = this.app.metadataCache.getFileCache(file);
                        return cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
                    });

                    if (files.length === 0) {
                        dropdown.addOption("", "No databases found");
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
            new Notice("Database name is required");
            return;
        }
        
        if (this.mode === "append" && !this.existingDbPath) {
             new Notice("Existing DB path is required");
             return;
        }

        if (this.sourceType === "obsidian") {
            if (!this.folderPath) {
                new Notice("Source folder is required");
                return;
            }
            await this.importFromObsidian();
        } else {
            if (!this.githubUsername) {
                new Notice("Github username is required");
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
                 new Notice("All items were duplicates. Nothing new to import.");
             } else if (report.total === 0) {
                 new Notice("No items found to import.");
             }
             return;
        }

        if (this.mode === "new") {
            const fileName = `${this.dbName}.md`;
            const header = `---\nmarkdown-db: true\n---\n\n# ${this.dbName}\n\n`;
            await this.app.vault.create(fileName, header + contentToAppend);
            new Notice(`Database "${fileName}" created successfully!`);
        } else {
            const file = this.app.vault.getAbstractFileByPath(this.existingDbPath);
            if (file && file instanceof TFile) {
                if (isFullContent) {
                    await this.app.vault.modify(file, contentToAppend);
                    new Notice(`Imported ${report.total} items to "${file.basename}" (Updated: ${report.updated || 0}, New: ${report.total - (report.updated || 0)}).`);
                } else {
                    await this.app.vault.process(file, (data) => {
                        return data + "\n" + contentToAppend;
                    });
                    new Notice(`Imported ${report.total - (report.skipped || 0)} items to "${file.basename}" (Skipped ${report.skipped || 0} duplicates).`);
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
            new Notice("Invalid folder path");
            return;
        }

        this.close();
        new Notice(`Starting import from folder: ${this.folderPath}...`);

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
                    contentToAppend += `%% ${propsParts.join(" ")} %%\n\n`;
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
            new Notice("Failed to import: " + error.message);
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
        new Notice(`Starting import for user: ${this.githubUsername}...`);

        try {
            const stars = await fetchGithubStars(this.githubUsername, this.githubToken);
            new Notice(`Fetched ${stars.length} starred repositories. Processing...`);
            
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
            new Notice("Import failed: " + e.message);
        }
    }

    async importFromGithubPR() {
        this.close();
        new Notice(`Starting PR import for user: ${this.githubUsername}...`);

        try {
            const allPrs = await fetchGithubPRs(this.githubUsername, this.githubToken);
            // Filter out closed and unmerged PRs (discarded)
            const prs = allPrs.filter(pr => !(pr.state === 'closed' && !pr.pull_request?.merged_at));

            new Notice(`Fetched ${allPrs.length} PRs. Processing ${prs.length} valid items...`);
            
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
            new Notice("Import failed: " + e.message);
        }
    }
}
