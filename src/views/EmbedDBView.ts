import { App, TFile, Notice, Menu, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type MarkdownDBPlugin from "../main";
import { DatabaseRecord, DatabaseConfig, PropertyType } from "../database/schema";
import { parseFile } from "../database/parser";
import { 
    updateProperty, renameRecord, addRecord, updateConfig, deleteRecord, 
    updateContent, addPropertyToAllRecords, deletePropertyFromAllRecords, 
    updateTitle, reorderRecords, renamePropertyInAllRecords,
    deleteView, renameView, reorderViews
} from "../database/writer";
import { RecordModal } from "../modals/RecordModal";
import { RenameModal } from "../modals/RenameModal";
import { IMarkdownDBView, MarkdownDBApp } from "./view";

class ReactEmbedChild extends MarkdownRenderChild {
    root: Root | null = null;
    component: React.ReactElement;

    constructor(containerEl: HTMLElement, component: React.ReactElement) {
        super(containerEl);
        this.component = component;
    }

    onload() {
        this.root = createRoot(this.containerEl);
        this.root.render(this.component);
    }

    onunload() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
    }
}

export class EmbedDBView implements IMarkdownDBView {
    plugin: MarkdownDBPlugin;
    app: App;
    file: TFile | null;

    constructor(plugin: MarkdownDBPlugin, file: TFile) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.file = file;
    }

    static async markdownPostProcessor(plugin: MarkdownDBPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        // Debugging: Log element type
        // console.log("[MarkdownDB] PostProcessor called", { el, sourcePath: ctx.sourcePath });

        const candidates: Set<HTMLElement> = new Set();

        // 1. Check if 'el' itself is an embed
        if (el.hasClass("internal-embed")) {
            candidates.add(el);
        }

        // 2. Check for children embeds
        const children = el.querySelectorAll(".internal-embed");
        if (children.length > 0) {
            children.forEach((child) => candidates.add(child as HTMLElement));
        }

        // 3. Check parent (Strict Upward Traversal for Live Preview)
        // Always check parent if we haven't found anything yet.
        // Also check for SIBLINGS by checking children of parents (e.g. if parent is a cm-line)
        if (candidates.size === 0) {
            let parent = el.parentElement;
            let depth = 0;
            const MAX_DEPTH = 5; // Safety limit

            while (parent && depth < MAX_DEPTH) {
                // STOP immediately if we hit a boundary
                if (parent.hasClass("markdown-source-view") || 
                    parent.hasClass("markdown-reading-view") ||
                    parent.hasClass("cm-editor") ||
                    parent.hasClass("view-content") ||
                    parent.hasClass("workspace-leaf")) {
                    break;
                }

                // A. Is parent the embed?
                if (parent.hasClass("internal-embed")) {
                    candidates.add(parent);
                    break; // Found it
                }

                // B. Does parent CONTAIN embeds? (e.g. if parent is a line wrapper like .cm-line)
                // Only do this for specific 'safe' containers to avoid scanning the whole doc
                if (parent.hasClass("cm-line") || parent.tagName === "P" || parent.tagName === "DIV") {
                    const siblings = parent.querySelectorAll(".internal-embed");
                    if (siblings.length > 0) {
                        siblings.forEach((sib) => candidates.add(sib as HTMLElement));
                        if (candidates.size > 0) break;
                    }
                }

                parent = parent.parentElement;
                depth++;
            }
        }

        const root = el.closest(".markdown-source-view, .markdown-reading-view");
        if (root) {
            const now = Date.now();
            const lastScan = Number(root.getAttribute("data-markdown-db-scan") ?? "0");
            if (now - lastScan > 200) {
                root.setAttribute("data-markdown-db-scan", String(now));
                const allEmbeds = root.querySelectorAll(".internal-embed");
                if (allEmbeds.length > 0) {
                    allEmbeds.forEach((node) => candidates.add(node as HTMLElement));
                }
            }
        }

        // Only process if we actually found something
        if (candidates.size > 0) {
            for (const candidate of candidates) {
                await EmbedDBView.tryProcessEmbed(plugin, candidate, ctx);
            }
        }
    }

    /**
     * Tries to process a specific element as an embed.
     * Returns true if it was a valid DB embed and was processed.
     */
    static async tryProcessEmbed(plugin: MarkdownDBPlugin, embedEl: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<boolean> {
        try {
            // Safety check: Ensure we are still in the DOM and valid
            if (!embedEl.isConnected && !document.contains(embedEl)) {
                 // In some race conditions, element might be detached. 
                 // But in Live Preview post-processing, it might be a detached fragment before insertion?
                 // Let's allow it, but be careful.
                 console.warn("[MarkdownDB] Element is detached from DOM", embedEl);
            }

            if (embedEl.hasAttribute("data-rendering")) {
                return true;
            }

            const src = embedEl.getAttribute("src");
            if (!src) return false;

            const file = plugin.app.metadataCache.getFirstLinkpathDest(src.split('#')[0], ctx.sourcePath);
            if (!file || !(file instanceof TFile) || file.extension !== "md") return false;
            
            const cache = plugin.app.metadataCache.getFileCache(file);
            const isDB = cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
            
            if (!isDB) return false;

            // If already processed/ready with the SAME source AND has content, consider it handled.
            // Obsidian might clear innerHTML but keep attributes, so we must check childElementCount.
            // Also check for our specific class to ensure it's our content.
            const currentReady = embedEl.getAttribute("ready");
            const hasClass = embedEl.hasClass("markdown-db-embed");
            if (currentReady && currentReady === src && embedEl.childElementCount > 0 && hasClass) return true;

            embedEl.setAttribute("data-rendering", "true");

            try {
                const alt = embedEl.getAttribute("alt") ?? "";
                
                // Prepare element
                embedEl.empty();
                embedEl.setAttribute("ready", src); // Store src to handle recycling
                embedEl.addClass("markdown-db-embed");
                embedEl.addClass("is-loaded"); // Ensure it looks loaded
                
                // Prevent click propagation (important for Reading Mode)
                embedEl.addEventListener("click", (e) => e.stopPropagation());

                // Handle markdown-embed class (Live Preview)
                const markdownEmbed = embedEl.hasClass("markdown-embed");
                
                await EmbedDBView.renderEmbed(plugin, embedEl, src, alt, ctx);

                if (markdownEmbed) {
                    embedEl.removeClass("markdown-embed");
                    embedEl.removeClass("inline-embed");
                }
            } finally {
                embedEl.removeAttribute("data-rendering");
            }

            return true;
        } catch (e) {
            console.error("Markdown DB: Error processing embed", e);
            embedEl.removeAttribute("data-rendering");
            return false;
        }
    }

    // Legacy methods removed
    static async processLivePreviewUpward(plugin: MarkdownDBPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<boolean> {
        return false;
    }
    static async processLivePreview(plugin: MarkdownDBPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext) {}
    static async processReadingMode(plugin: MarkdownDBPlugin, embeddedItems: NodeListOf<HTMLElement>, ctx: MarkdownPostProcessorContext) {}

    static async renderEmbed(plugin: MarkdownDBPlugin, container: HTMLElement, src: string, alt: string, ctx: MarkdownPostProcessorContext) {
        const parts = src.split("#");
        const filePath = parts[0];
        // Decode URI component for the view name in case it contains special characters
        const viewName = parts.length > 1 ? decodeURIComponent(parts[1]) : undefined;

        const file = plugin.app.metadataCache.getFirstLinkpathDest(filePath, ctx.sourcePath);
        
        if (!file || !(file instanceof TFile) || file.extension !== "md") return;

        // Check if it's a DB file
        const cache = plugin.app.metadataCache.getFileCache(file);
        const isDB = cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
        if (!isDB) return;

        // Parse height from alt
        let height: string | null = null;
        const matchResult = alt.match(/(\d+)/);
        if (matchResult && matchResult.length > 0) {
            height = `${matchResult[0]}px`;
        }

        if (height) {
            container.style.height = height;
            container.style.overflow = "hidden";
        }
        
        const content = await plugin.app.vault.read(file);
        const embedView = new EmbedDBView(plugin, file);

        // Create a dedicated MarkdownRenderChild for the app to use for Markdown rendering
        // This ensures proper lifecycle management for MarkdownRenderer.render
        const renderComponent = new MarkdownRenderChild(container);

        const appComponent = React.createElement(MarkdownDBApp, {
            fileContent: content,
            file: file,
            view: embedView,
            globalProperties: plugin.settings.properties,
            component: renderComponent,
            readonly: true,
            initialView: viewName,
            onSaveToGlobal: (name, type) => {
                const newProps = [...plugin.settings.properties];
                const existing = newProps.find(p => p.name === name);
                if (existing) {
                    existing.type = type || 'text';
                } else {
                    newProps.push({ 
                        name, 
                        type: type || 'text',
                        values: [],
                        ignoredValues: []
                    });
                }
                plugin.settings.properties = newProps;
                plugin.saveSettings();
            },
            onRemoveGlobalValue: (key, value) => {
                // Optional implementation
            }
        });

        const child = new ReactEmbedChild(container, appComponent);
        child.addChild(renderComponent); // Manage lifecycle
        ctx.addChild(child);
        // child.load(); // Let Obsidian/ctx manage the load lifecycle
    }


    handleUpdateProperty = async (record: DatabaseRecord, key: string, value: string, explicitType?: string) => {
        if (this.file) {
            await updateProperty(this.app, this.file, record, key, value, explicitType);
        }
    }

    handleUpdateContent = async (record: DatabaseRecord, newContent: string) => {
        if (this.file) {
            await updateContent(this.app, this.file, record, newContent);
        }
    }

    handleRenameRecord = async (record: DatabaseRecord, newName: string) => {
        if (this.file) {
            await renameRecord(this.app, this.file, record.title, newName);
        }
    }

    handleAddRecord = async () => {
        if (this.file) {
            await addRecord(this.app, this.file, "Untitled");
        }
    }

    handleAddProperty = async (name: string, type: string = "text") => {
        if (!this.file) return;

        await addPropertyToAllRecords(this.app, this.file, name, type);

        const content = await this.app.vault.read(this.file);
        const dbData = parseFile(content);
        
        const newTypes = { ...(dbData.config.columnTypes || {}), [name]: type };
        await updateConfig(this.app, this.file, "db-column-types", JSON.stringify(newTypes));
    }

    handleUpdateConfig = async (key: string, value: string, viewName?: string) => {
        if (this.file) {
            await updateConfig(this.app, this.file, key, value, viewName);
        }
    }

    handleUpdateTitle = async (newTitle: string) => {
        if (this.file) {
            await updateTitle(this.app, this.file, newTitle);
        }
    }

    handleReorderRecord = async (fromIndex: number, toIndex: number) => {
        if (this.file) {
            await reorderRecords(this.app, this.file, fromIndex, toIndex);
        }
    }

    handleDeleteView = async (viewName: string) => {
        if (this.file) {
            await deleteView(this.app, this.file, viewName);
        }
    }

    handleRenameView = async (oldName: string, newName: string) => {
        if (this.file) {
            await renameView(this.app, this.file, oldName, newName);
        }
    }

    handleReorderViews = async (viewNames: string[]) => {
        if (this.file) {
            await reorderViews(this.app, this.file, viewNames);
        }
    }

    handleOpenRecord = async (record: DatabaseRecord, config: DatabaseConfig) => {
        if (!this.file) return;

        const mode = config.openMode;

        if (mode === "modal") {
            new RecordModal(this.app, this.file, record).open();
        } else if (mode === "split") {
             const leaf = this.app.workspace.getLeaf('split', 'vertical');
             await leaf.openFile(this.file, {
                state: { mode: "source" },
                eState: { line: record.lineStart }
            });
        } else {
            const leaf = this.app.workspace.getLeaf("tab");
            await leaf.openFile(this.file, {
                state: { mode: "source" },
                eState: { line: record.lineStart }
            });
        }
    }

    handleRowContextMenu = (record: DatabaseRecord, event: React.MouseEvent) => {
        event.preventDefault();
        const menu = new Menu();
        menu.addItem((item) => {
            item
                .setTitle("Delete")
                .setIcon("trash")
                .onClick(async () => {
                    if (this.file) {
                        await deleteRecord(this.app, this.file, record);
                    }
                });
        });
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    handleHeaderContextMenu = (key: string, event: React.MouseEvent, config?: DatabaseConfig, records?: DatabaseRecord[], viewName?: string) => {
        event.preventDefault();

        const menu = new Menu();

        menu.addItem((item) => {
            item
                .setTitle("Rename property")
                .setIcon("pencil")
                .onClick(() => {
                    new RenameModal(this.app, key, async (newName) => {
                        if (newName && newName !== key && this.file) {
                             await renamePropertyInAllRecords(this.app, this.file!, key, newName);
                             
                             if (config?.columnTypes && config.columnTypes[key]) {
                                 const type = config.columnTypes[key];
                                 const newTypes = { ...config.columnTypes };
                                 delete newTypes[key];
                                 newTypes[newName] = type;
                                 await updateConfig(this.app, this.file!, "db-column-types", JSON.stringify(newTypes), viewName);
                             }
                             
                             if (config?.columnOrder && config.columnOrder.includes(key)) {
                                 const newOrder = config.columnOrder.map(k => k === key ? newName : k);
                                 await updateConfig(this.app, this.file!, "db-columns", JSON.stringify(newOrder), viewName);
                             }
                             
                             new Notice(`Property renamed to "${newName}"`);
                        }
                    }).open();
                });
        });

        const globalProp = this.plugin.settings.properties.find(p => p.name === key);
        if (!globalProp) {
            menu.addItem((item) => {
                item
                    .setTitle("Add to global properties")
                    .setIcon("globe")
                    .onClick(async () => {
                        let type: PropertyType = "text";
                        if (config?.columnTypes && config.columnTypes[key]) {
                            type = config.columnTypes[key];
                        } else if (records) {
                             const foundRecord = records.find(r => r.properties[key] && r.properties[key].length > 0);
                             if (foundRecord) {
                                 type = foundRecord.properties[key][0].type;
                             }
                        }
                        
                        this.plugin.settings.properties = [
                            ...this.plugin.settings.properties,
                            {
                                name: key,
                                type: type,
                                values: [],
                                ignoredValues: []
                            }
                        ];
                        await this.plugin.saveSettings();
                        new Notice(`Property "${key}" added to global settings`);
                    });
            });
        }

        menu.addItem((item) => {
            item
                .setTitle("Hide property")
                .setIcon("eye-off")
                .onClick(async () => {
                    if (this.file && config) {
                        const currentHidden = config.hiddenColumns || [];
                        const newHidden = [...currentHidden, key];
                        
                        await updateConfig(this.app, this.file!, "db-hide-columns", JSON.stringify(newHidden), viewName);
                    }
                });
        });

        if (config) {
            const hiddenColumns = config.hiddenColumns || [];
            if (hiddenColumns.length > 0) {
                 menu.addItem((item) => {
                     item
                         .setTitle("Unhide property")
                         .setIcon("eye")
                         .setSection("view");
                     
                     const submenu = (item as any).setSubmenu() as Menu;
                     
                     hiddenColumns.forEach(hiddenKey => {
                         submenu.addItem((subItem) => {
                             subItem.setTitle(hiddenKey)
                                    .onClick(async () => {
                                        if (this.file) {
                                            const newHidden = hiddenColumns.filter(k => k !== hiddenKey);
                                            await updateConfig(this.app, this.file!, "db-hide-columns", JSON.stringify(newHidden), viewName);
                                        }
                                    });
                         });
                     });
                 });
            }
        }

        menu.addSeparator();

        menu.addItem((item) => {
            item
                .setTitle(`Delete property "${key}"`)
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    if (this.file) {
                        await deletePropertyFromAllRecords(this.app, this.file!, key);
                        new Notice(`Property "${key}" deleted`);
                    }
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }
}
