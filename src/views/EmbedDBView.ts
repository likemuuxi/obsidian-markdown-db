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
    root: Root;
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
        this.root.unmount();
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
        // Check if we are in editing mode (Live Preview) or reading mode
        const embeddedItems = el.querySelectorAll(".internal-embed");
        
        if (embeddedItems.length === 0) {
            // Potentially Live Preview (editing mode)
            await EmbedDBView.processLivePreview(plugin, el, ctx);
            return;
        }

        // Reading Mode
        await EmbedDBView.processReadingMode(plugin, embeddedItems as NodeListOf<HTMLElement>, ctx);
    }

    static async processLivePreview(plugin: MarkdownDBPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;

        // Check if current file is a DB file
        const cache = plugin.app.metadataCache.getFileCache(file);
        const isDB = cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";

        // Traverse up to find the container
        // @ts-ignore
        let internalEmbedDiv: HTMLElement = ctx.containerEl;
        
        // This traversal logic mimics the reference to find the correct container
        // in Live Preview
        while (
            !internalEmbedDiv.hasClass("dataview") &&
            !internalEmbedDiv.hasClass("cm-preview-code-block") &&
            !internalEmbedDiv.hasClass("cm-embed-block") &&
            !internalEmbedDiv.hasClass("internal-embed") &&
            !internalEmbedDiv.hasClass("markdown-reading-view") &&
            !internalEmbedDiv.hasClass("markdown-embed") &&
            internalEmbedDiv.parentElement
        ) {
            internalEmbedDiv = internalEmbedDiv.parentElement;
        }

        if (
            internalEmbedDiv.hasClass("dataview") ||
            internalEmbedDiv.hasClass("cm-preview-code-block") ||
            internalEmbedDiv.hasClass("cm-embed-block")
        ) {
            return;
        }

        const markdownEmbed = internalEmbedDiv.hasClass("markdown-embed");
        const markdownReadingView = internalEmbedDiv.hasClass("markdown-reading-view");

        // If we found the main reading view and it is NOT explicitly an embed wrapper, abort.
        // This prevents hijacking the main file rendering in Reading Mode.
        if (markdownReadingView && !markdownEmbed && !internalEmbedDiv.hasClass("internal-embed")) {
            return;
        }

        // Processing the preview of an actual DB file
        if (!internalEmbedDiv.hasClass("internal-embed") && (markdownEmbed || markdownReadingView)) {
            if (!isDB) return;

            const isFrontmatterDiv = Boolean(el.querySelector(".frontmatter"));
             el.empty();
             if (!isFrontmatterDiv) {
                 // @ts-ignore
                 if (el.parentElement === ctx.containerEl) ctx.containerEl.removeChild(el);
                 return;
             }
             internalEmbedDiv.empty();
             internalEmbedDiv.addClass("markdown-db-embed");

             // Get source and alt
             let src = internalEmbedDiv.getAttribute("src") ?? "";
             const alt = internalEmbedDiv.getAttribute("alt") ?? "";
             
             if (!src) {
                src = ctx.sourcePath;
             }
             
             await EmbedDBView.renderEmbed(plugin, internalEmbedDiv, src, alt, ctx);
             
             if (markdownEmbed) {
                 internalEmbedDiv.removeClass("markdown-embed");
                 internalEmbedDiv.removeClass("inline-embed");
             }
             return;
        }

        // Check if we are inside an embed container
        if (!internalEmbedDiv.hasClass("internal-embed")) {
            return;
        }

        // Check if the linked file is a DB file before proceeding
        const src = internalEmbedDiv.getAttribute("src");
        if (!src) return;

        const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(src.split('#')[0], ctx.sourcePath);
        if (!targetFile || !(targetFile instanceof TFile)) return;
        
        const targetCache = plugin.app.metadataCache.getFileCache(targetFile);
        const targetIsDB = targetCache?.frontmatter?.["markdown-db"] === true || targetCache?.frontmatter?.["markdown-db"] === "true";

        if (!targetIsDB) return;

        el.empty();
        
        if (internalEmbedDiv.hasAttribute("ready")) {
            return;
        }
        internalEmbedDiv.setAttribute("ready", "");
        internalEmbedDiv.empty();
        internalEmbedDiv.addClass("markdown-db-embed");

        const alt = internalEmbedDiv.getAttribute("alt") ?? "";

        await EmbedDBView.renderEmbed(plugin, internalEmbedDiv, src, alt, ctx);

        if (markdownEmbed) {
            internalEmbedDiv.removeClass("markdown-embed");
            internalEmbedDiv.removeClass("inline-embed");
        }
    }

    static async processReadingMode(plugin: MarkdownDBPlugin, embeddedItems: NodeListOf<HTMLElement>, ctx: MarkdownPostProcessorContext) {
        for (let i = 0; i < embeddedItems.length; i++) {
            const embed = embeddedItems[i];
            const src = embed.getAttribute("src");
            if (!src) continue;

            const file = plugin.app.metadataCache.getFirstLinkpathDest(src, ctx.sourcePath);
            if (file instanceof TFile && file.extension === "md") {
                const cache = plugin.app.metadataCache.getFileCache(file);
                const isDB = cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
                
                if (isDB) {
                    const alt = embed.getAttribute("alt") ?? "";
                    
                    // Replace the embed with our custom view
                    // We need to find the parent if we want to replace, or just empty and append
                    // The reference implementation replaces the parent element's child
                    
                    // In reading mode, 'embed' is the span.internal-embed
                    embed.empty();
                    embed.addClass("is-loaded");
                    embed.addClass("markdown-db-embed");
                    
                    // Prevent click propagation
                    embed.addEventListener("click", (e) => e.stopPropagation());
                    
                    await EmbedDBView.renderEmbed(plugin, embed, src, alt, ctx);
                }
            }
        }
    }

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
            child.load();
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