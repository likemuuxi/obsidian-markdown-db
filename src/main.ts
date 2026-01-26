import { Plugin, WorkspaceLeaf, TFile, TFolder, debounce, FileView } from "obsidian";
import { MarkdownDBView, VIEW_TYPE_MARKDOWN_DB } from "./view";
import { RecordEditView, VIEW_TYPE_RECORD_EDIT } from "./views/RecordEditView";
import { MarkdownDBSettings, DEFAULT_SETTINGS, MarkdownDBSettingTab } from "./settings";
import { parseFile } from "./database/parser";

import { DashboardModal } from "./modals/DashboardModal";

export default class MarkdownDBPlugin extends Plugin {
    settings: MarkdownDBSettings;
    isToggling = false;

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_MARKDOWN_DB,
            (leaf) => new MarkdownDBView(leaf, this)
        );

        this.registerView(
            VIEW_TYPE_RECORD_EDIT,
            (leaf) => new RecordEditView(leaf)
        );

        this.addSettingTab(new MarkdownDBSettingTab(this.app, this));

        // Monkey patch WorkspaceLeaf.openFile to support seamless DB view opening
        this.monkeyPatchOpenFile();

        // Register Dashboard Command
        this.addCommand({
            id: "open-dashboard",
            name: "Open Database Dashboard",
            callback: () => {
                new DashboardModal(this.app, this).open();
            }
        });

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                menu.addItem((item) => {
                    item
                        .setTitle("New DB File")
                        .setIcon("table")
                        .onClick(async () => {
                            let folderPath = "";
                            if (file instanceof TFolder) {
                                folderPath = file.path;
                            } else if (file instanceof TFile && file.parent) {
                                folderPath = file.parent.path;
                            }

                            // Normalize path (remove trailing slash if any, though usually not present)
                            if (folderPath === "/") folderPath = "";

                            let filename = "Untitled DB.md";
                            let filePath = folderPath ? `${folderPath}/${filename}` : filename;

                            let i = 1;
                            while (await this.app.vault.adapter.exists(filePath)) {
                                filename = `Untitled DB ${i}.md`;
                                filePath = folderPath ? `${folderPath}/${filename}` : filename;
                                i++;
                            }

                            const initialContent = "---\nmarkdown-db: true\ndb-open-mode: modal\ndb-layout: table\n---\n\n# Database\n";
                            const newFile = await this.app.vault.create(filePath, initialContent);

                            const leaf = this.app.workspace.getLeaf(false);
                            await leaf.openFile(newFile);
                            
                            // Explicitly switch to DB view for new files
                            await leaf.setViewState({
                                type: VIEW_TYPE_MARKDOWN_DB,
                                state: { file: newFile.path }
                            });
                        });
                });
            })
        );

        this.registerHoverLinkSource(VIEW_TYPE_MARKDOWN_DB, {
            display: 'Markdown DB',
            defaultMod: true
        });

        this.addCommand({
            id: "toggle-markdown-db-view",
            name: "Toggle Database Table View",
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (file) {
                    if (!checking) {
                        this.toggleView(file);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: "scan-markdown-db-values",
            name: "Scan Database Files for Property Values",
            callback: () => {
                this.scanAllDatabaseFiles();
            }
        });

        // this.addCommand({
        //     id: "refresh-markdown-db-badges",
        //     name: "Force Refresh DB Badges",
        //     callback: () => {
        //         this.updateFileExplorerBadges();
        //     }
        // });

        this.addRibbonIcon("table", "Toggle Markdown DB", () => {
            const file = this.app.workspace.getActiveFile();
            if (file) {
                this.toggleView(file);
            }
        });

        // Scan files on startup (debounced to let cache warm up)
        this.app.workspace.onLayoutReady(() => {
            this.scanAllDatabaseFiles();
            this.updateFileExplorerBadges();
            this.registerFileExplorerObserver();
            // Check current file on startup
            const file = this.app.workspace.getActiveFile();
            if (file) {
                // 插件启动时自动切换到 DB 视图（如果当前文件是 DB 文件）
                const leaf = this.app.workspace.getLeaf(false);
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter?.["markdown-db"]) {
                    leaf.setViewState({
                        type: VIEW_TYPE_MARKDOWN_DB,
                        state: { file: file.path }
                    });
                }
            }
        });

        // Listen for file changes to update values
        const debouncedScan = debounce(this.scanFile.bind(this), 1000, true);
        this.registerEvent(this.app.vault.on("modify", (file) => {
            if (file instanceof TFile && file.extension === "md") {
                debouncedScan(file);
            }
        }));

        // Listen for metadata changes to update badges
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            this.updateFileExplorerBadges();
        }));
        this.registerEvent(this.app.vault.on('rename', () => this.updateFileExplorerBadges()));
        this.registerEvent(this.app.vault.on('create', () => this.updateFileExplorerBadges()));
        this.registerEvent(this.app.vault.on('delete', () => this.updateFileExplorerBadges()));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async scanFile(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.["markdown-db"]) {
            const content = await this.app.vault.read(file);
            const data = parseFile(content);
            let updated = false;

            data.records.forEach(record => {
                Object.entries(record.properties).forEach(([key, values]) => {
                    if (this.settings.knownProperties.includes(key)) {
                        // values is string[] (from parser)
                        // parser splits multiple [Key::Val1] [Key::Val2], but we also want to split comma separated strings
                        
                        values.forEach(rawVal => {
                            const splitVals = rawVal.split(",").map(v => v.trim()).filter(v => v);
                            
                            if (!this.settings.propertyValues[key]) {
                                this.settings.propertyValues[key] = [];
                            }

                            splitVals.forEach(val => {
                                if (!this.settings.propertyValues[key].includes(val)) {
                                    this.settings.propertyValues[key].push(val);
                                    updated = true;
                                }
                            });
                        });
                    }
                });
            });

            if (updated) {
                await this.saveSettings();
            }
        }
    }

    async scanAllDatabaseFiles() {
        const files = this.app.vault.getMarkdownFiles();
        let updated = false;
        
        // Reset or Merge? 
        // If we reset, we lose values from files that might not be scanned if we change logic later.
        // But if we don't reset, deleted values persist forever.
        // For now, let's keep it additive.
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter?.["markdown-db"]) {
                const content = await this.app.vault.read(file);
                const data = parseFile(content);

                data.records.forEach(record => {
                    Object.entries(record.properties).forEach(([key, values]) => {
                        if (this.settings.knownProperties.includes(key)) {
                             values.forEach(rawVal => {
                                const splitVals = rawVal.split(",").map(v => v.trim()).filter(v => v);
                                
                                if (!this.settings.propertyValues[key]) {
                                    this.settings.propertyValues[key] = [];
                                }

                                splitVals.forEach(val => {
                                    if (!this.settings.propertyValues[key].includes(val)) {
                                        this.settings.propertyValues[key].push(val);
                                        updated = true;
                                    }
                                });
                            });
                        }
                    });
                });
            }
        }

        if (updated) {
            await this.saveSettings();
            console.log("Markdown DB: Property values updated.");
        }
    }

    async toggleView(file: TFile) {
        this.isToggling = true;
        const leaf = this.app.workspace.getLeaf(false);
        try {
            if (leaf.view.getViewType() === VIEW_TYPE_MARKDOWN_DB) {
                await leaf.setViewState({
                    type: "markdown",
                    state: { file: file.path }
                });
            } else {
                await leaf.setViewState({
                    type: VIEW_TYPE_MARKDOWN_DB,
                    state: { file: file.path }
                });
            }
        } finally {
            setTimeout(() => {
                this.isToggling = false;
            }, 200);
        }
    }

    monkeyPatchOpenFile() {
        const plugin = this;
        const originalOpenFile = WorkspaceLeaf.prototype.openFile;
        
        plugin.register(() => {
            WorkspaceLeaf.prototype.openFile = originalOpenFile;
        });

        WorkspaceLeaf.prototype.openFile = async function(file: TFile, state?: any) {
            // Check if this is a DB file
            // We need a fast check here.
            let isDB = false;
            
            if (file.extension === "md") {
                 const cache = plugin.app.metadataCache.getFileCache(file);
                 if (cache?.frontmatter?.["markdown-db"]) {
                     isDB = true;
                 } else if (!cache) {
                     // If no cache (new file or startup), try reading a bit of content
                     // This might be slightly slow but necessary for "seamless" feeling on cold start
                     try {
                        const content = await plugin.app.vault.read(file);
                        if (/^---\s*[\s\S]*?markdown-db:\s*true/.test(content)) {
                            isDB = true;
                        }
                     } catch {}
                 }
            }

            if (isDB) {
                // If explicitly requesting markdown mode (source/preview), allow it.
                // This allows opening DB files as regular markdown when clicking from the DB view itself
                // (where we pass state: { mode: "source" }).
                if (state?.state?.mode === "source" || state?.state?.mode === "preview") {
                    return originalOpenFile.call(this, file, state);
                }

                // If opening in a new leaf (empty view), treat as "Split" and allow default Markdown view
                // This fulfills the requirement: "分栏打开的时候，分栏要使用markdown视图"
                // When opening in a split (Ctrl+Click), the leaf is new and has 'empty' view type.
                if (this.view.getViewType() === "empty") {
                    return originalOpenFile.call(this, file, state);
                }

                if (!plugin.isToggling) {
                     return this.setViewState({
                         type: VIEW_TYPE_MARKDOWN_DB,
                         state: { file: file.path, ...state }
                     });
                }
            }

            return originalOpenFile.call(this, file, state);
        };
    }

    updateFileExplorerBadges() {
        // Retry logic wrapped inside to ensure view is ready
        this.updateFileExplorerBadgesWithRetry();
    }

    async updateFileExplorerBadgesWithRetry(retryCount = 0) {
        const MAX_RETRY = 10;
        const RETRY_INTERVAL = 500;
        const BADGE_CLASS = "markdown-db-badge";
        const OBSIDIAN_TAG_CLASS = "nav-file-tag";

        const fileExplorerLeaves = this.app.workspace.getLeavesOfType("file-explorer");
        
        if (fileExplorerLeaves.length === 0) {
            if (retryCount < MAX_RETRY) {
                setTimeout(() => this.updateFileExplorerBadgesWithRetry(retryCount + 1), RETRY_INTERVAL);
            }
            return;
        }

        fileExplorerLeaves.forEach((leaf) => {
            const view = leaf.view as any;
            if (view.fileItems) {
                for (const [path, item] of Object.entries(view.fileItems)) {
                    const navItem = item as any;
                    // navItem.selfEl is the full row container (div.nav-file-title)
                    const selfEl = navItem.selfEl;
                    
                    if (selfEl) {
                        // Remove existing badges first to avoid duplicates
                        const existingBadges = selfEl.querySelectorAll(`.${BADGE_CLASS}`);
                        existingBadges.forEach((b: HTMLElement) => b.remove());

                        const file = this.app.vault.getAbstractFileByPath(path);
                        if (file instanceof TFile && file.extension === "md") {
                            const cache = this.app.metadataCache.getFileCache(file);
                            const dbVal = cache?.frontmatter?.["markdown-db"];
                            const isDB = dbVal === true || dbVal === "true";

                            if (isDB) {
                                const badge = document.createElement("div");
                                badge.className = `${OBSIDIAN_TAG_CLASS} ${BADGE_CLASS}`;
                                badge.innerText = "DB";
                                selfEl.appendChild(badge);
                            }
                        }
                    }
                }
            }
        });
    }

    registerFileExplorerObserver() {
        // We still keep the observer for dynamic updates (renames, moving files etc)
        // But we rely on the specific badge update logic
        this.app.workspace.onLayoutReady(() => {
            const fileExplorerLeaves = this.app.workspace.getLeavesOfType("file-explorer");
            fileExplorerLeaves.forEach((leaf) => {
                const container = leaf.view.containerEl;
                if (container) {
                    const observer = new MutationObserver((mutations) => {
                        let shouldUpdate = false;
                        for (const mutation of mutations) {
                            if (mutation.target instanceof HTMLElement && 
                                (mutation.target.classList.contains('nav-files-container') || 
                                 mutation.target.classList.contains('nav-folder-children'))) {
                                shouldUpdate = true;
                                break;
                            }
                        }
                        if (shouldUpdate) {
                            this.updateFileExplorerBadges();
                        }
                    });
                    observer.observe(container, { childList: true, subtree: true });
                    this.register(() => observer.disconnect());
                }
            });
            // Initial update
            this.updateFileExplorerBadges();
        });
    }

    async onunload() {

    }
}
