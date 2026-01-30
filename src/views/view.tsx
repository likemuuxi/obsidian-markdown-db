import { TextFileView, WorkspaceLeaf, TFile, WorkspaceSplit, MarkdownView, Menu, Notice, App } from "obsidian";
import * as React from "react";
import { useState, useMemo } from "react";
import { createRoot, Root } from "react-dom/client";
import { TableView } from "../components/TableView";
import { Toolbar } from "../components/Toolbar";
import { parseFile} from "../database/parser";
import { DatabaseRecord, DatabaseConfig, PropertyType, FilterRule, SortRule } from "../database/schema";
import { updateProperty, renameRecord, addRecord, updateConfig, deleteRecord, updateContent, addPropertyToAllRecords, deletePropertyFromAllRecords, updateTitle, reorderRecords, renamePropertyInAllRecords,
    deleteView,
    renameView,
    reorderViews
} from "../database/writer";
import { RecordModal } from "../modals/RecordModal";
import { RenameModal } from "../modals/RenameModal";
import type MarkdownDBPlugin from "../main";

import { PropertyConfig } from "../settings";

export const VIEW_TYPE_MARKDOWN_DB = "markdown-db-view";

export interface IMarkdownDBView {
    plugin: MarkdownDBPlugin;
    app: App;
    file: TFile | null;
    handleUpdateProperty: (record: DatabaseRecord, key: string, value: string, explicitType?: string) => Promise<void>;
    handleUpdateContent: (record: DatabaseRecord, newContent: string) => Promise<void>;
    handleRenameRecord: (record: DatabaseRecord, newName: string) => Promise<void>;
    handleOpenRecord: (record: DatabaseRecord, config: DatabaseConfig) => Promise<void>;
    handleAddRecord: () => Promise<void>;
    handleAddProperty: (name: string, type?: string) => Promise<void>;
    handleUpdateConfig: (key: string, value: string, viewName?: string) => Promise<void>;
    handleUpdateTitle: (newTitle: string) => Promise<void>;
    handleReorderRecord: (fromIndex: number, toIndex: number) => Promise<void>;
    handleDeleteView: (viewName: string) => Promise<void>;
    handleRenameView: (oldName: string, newName: string) => Promise<void>;
    handleReorderViews: (viewNames: string[]) => Promise<void>;
    handleRowContextMenu: (record: DatabaseRecord, event: React.MouseEvent) => void;
    handleHeaderContextMenu: (key: string, event: React.MouseEvent, config?: DatabaseConfig, records?: DatabaseRecord[], viewName?: string) => void;
}

export const MarkdownDBApp = (props: {
    fileContent: string,
    file: TFile | null,
    view: IMarkdownDBView,
    globalProperties: PropertyConfig[],
    onSaveToGlobal: (name: string, type?: PropertyType) => void,
    onRemoveGlobalValue: (key: string, value: string) => void,
    component?: any,
    readonly?: boolean,
    initialView?: string
}) => {
    const dbData = useMemo(() => {
        const data = parseFile(props.fileContent);
        if (!data.title && props.file) {
            data.title = props.file.basename;
        }
        return data;
    }, [props.fileContent, props.file]);

    const resolvedInitialView = useMemo(() => {
        if (!props.initialView) return null;
        
        // 1. Direct match
        if (dbData.views && dbData.views[props.initialView]) {
            return props.initialView;
        }

        // 2. Try to match Title(ViewName) pattern
        // The parser extracts "ViewName" from "Title(ViewName)"
        if (dbData.title && props.initialView.startsWith(dbData.title)) {
            const remainder = props.initialView.substring(dbData.title.length).trim();
            let potentialName: string | null = null;
            
            if (remainder.startsWith("(") && remainder.endsWith(")")) {
                potentialName = remainder.substring(1, remainder.length - 1).trim();
            } else if (remainder.startsWith("（") && remainder.endsWith("）")) {
                potentialName = remainder.substring(1, remainder.length - 1).trim();
            }
            
            if (potentialName && dbData.views && dbData.views[potentialName]) {
                return potentialName;
            }
        }
        
        return props.initialView;
    }, [dbData, props.initialView]);

    const [searchTerm, setSearchTerm] = useState("");
    const [currentViewName, setCurrentViewName] = useState<string | null>(resolvedInitialView);

    const viewNotFound = useMemo(() => {
        if (props.initialView) {
            // Check if resolved view exists
            return !resolvedInitialView || !dbData.views || !dbData.views[resolvedInitialView];
        }
        return false;
    }, [dbData, resolvedInitialView, props.initialView]);

    const currentConfig = useMemo(() => {
        if (currentViewName && dbData.views && dbData.views[currentViewName]) {
            return dbData.views[currentViewName];
        }
        return dbData.config;
    }, [dbData, currentViewName]);

    const filteredRecords = useMemo(() => {
        if (!searchTerm) return dbData.records;
        const lowerTerm = searchTerm.toLowerCase();
        return dbData.records.filter(r =>
            r.title.toLowerCase().includes(lowerTerm) ||
            Object.values(r.properties).some(vals => vals.some(v => String(v).toLowerCase().includes(lowerTerm))) ||
            (r.content && r.content.toLowerCase().includes(lowerTerm))
        );
    }, [dbData.records, searchTerm]);

    const handleUpdateProperty = (record: DatabaseRecord, key: string, value: string, explicitType?: string) => {
        if (props.file) props.view.handleUpdateProperty(record, key, value, explicitType);
    };

    const handleUpdateContent = (record: DatabaseRecord, newContent: string) => {
        if (props.file) props.view.handleUpdateContent(record, newContent);
    };

    const handleRenameRecord = (record: DatabaseRecord, newName: string) => {
        if (props.file) props.view.handleRenameRecord(record, newName);
    };

    const handleOpenRecord = (record: DatabaseRecord) => {
        props.view.handleOpenRecord(record, currentConfig);
    };

    const handleAddRecord = () => {
        if (props.file) props.view.handleAddRecord();
    };

    const handleAddProperty = (name: string, type?: PropertyType) => {
        if (props.file) props.view.handleAddProperty(name, type);
    };

    const handleUpdateConfig = (key: string, value: string) => {
        if (props.file) props.view.handleUpdateConfig(key, value, currentViewName || undefined);
    };

    const handleSwitchView = (name: string | null) => {
        setCurrentViewName(name);
    };

    const handleAddView = async (name: string, config: { openMode: string, showContent: boolean, contentHeight: string, filters: FilterRule[], sorts: SortRule[] }) => {
        if (!name) return;
        
        // Check for duplicate names
        let newName = name;
        const existingViews = dbData.views ? Object.keys(dbData.views) : [];
        let index = 1;
        const originalName = newName;
        
        while (existingViews.includes(newName)) {
            newName = `${originalName} ${index}`;
            index++;
        }
        
        if (props.file) {
             // Initialize with user selected configs sequentially to avoid race conditions on view creation
             await props.view.handleUpdateConfig("db-open-mode", config.openMode, newName);
             await props.view.handleUpdateConfig("db-show-content", config.showContent ? "true" : "false", newName);
             await props.view.handleUpdateConfig("db-content-height", config.contentHeight, newName);
             
             // Save filters (use explicit config from popup)
             if (config.filters && config.filters.length > 0) {
                 await props.view.handleUpdateConfig("db-filter", JSON.stringify(config.filters), newName);
             }
             
             // Save sorts (use explicit config from popup)
             if (config.sorts && config.sorts.length > 0) {
                 await props.view.handleUpdateConfig("db-sort", JSON.stringify(config.sorts), newName);
             }

             setCurrentViewName(newName);
        }
    };

    const handleUpdateTitle = (newTitle: string) => {
        if (props.file) props.view.handleUpdateTitle(newTitle);
    };

    const handleRowContextMenu = (record: DatabaseRecord, event: React.MouseEvent) => {
        props.view.handleRowContextMenu(record, event);
    };

    const handleHeaderContextMenu = (key: string, event: React.MouseEvent) => {
        props.view.handleHeaderContextMenu(key, event, currentConfig, displayData.records, currentViewName || undefined);
    };

    const handleReorderRecord = (fromIndex: number, toIndex: number) => {
        if (props.file) props.view.handleReorderRecord(fromIndex, toIndex);
    };

    const handleRenameView = async (oldName: string, newName: string) => {
        if (props.file) await props.view.handleRenameView(oldName, newName);
        // Also update current view name if we renamed the active one
        if (currentViewName === oldName) {
            setCurrentViewName(newName);
        }
    };

    const handleDeleteView = async (name: string) => {
        if (props.file) await props.view.handleDeleteView(name);
        // Switch to default view if we deleted the active one
        if (currentViewName === name) {
            setCurrentViewName(null);
        }
    };

    const handleReorderViews = async (names: string[]) => {
        if (props.file) await props.view.handleReorderViews(names);
    };

    const handleUpdateViewConfig = (viewName: string, key: string, value: string) => {
        if (props.file) props.view.handleUpdateConfig(key, value, viewName);
    };

    // Override data records with filtered ones for display
    const displayData = { ...dbData, config: currentConfig, records: filteredRecords };

    if (viewNotFound) {
        return (
            <div className={`markdown-db-container ${props.readonly ? "markdown-db-readonly" : ""}`}>
                <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                    View "{props.initialView}" not found.
                </div>
            </div>
        );
    }

    return (
        <div className={`markdown-db-container ${props.readonly ? "markdown-db-readonly" : ""}`}>
            <Toolbar
                title={dbData.title}
                    config={currentConfig}
                    onSearch={setSearchTerm}
                    onUpdateConfig={handleUpdateConfig}
                    onAddRecord={handleAddRecord}
                    onUpdateTitle={handleUpdateTitle}
                    allProperties={Array.from(dbData.allKeys)}
                    views={dbData.views ? Object.keys(dbData.views) : []}
                    currentView={currentViewName}
                    onSwitchView={handleSwitchView}
                    onAddView={handleAddView}
                    onRenameView={handleRenameView}
                    onDeleteView={handleDeleteView}
                    onReorderViews={handleReorderViews}
                    viewsConfig={dbData.views}
                    onUpdateViewConfig={handleUpdateViewConfig}
                />
            <TableView
                app={props.view.app}
                data={displayData}
                fileName={props.file?.basename}
                sourcePath={props.file?.path}
                component={props.component}
                globalProperties={props.globalProperties}
                onUpdateProperty={handleUpdateProperty}
                onUpdateContent={handleUpdateContent}
                onRenameRecord={handleRenameRecord}
                onOpenRecord={handleOpenRecord}
                onAddRecord={handleAddRecord}
                onAddProperty={handleAddProperty}
                onSaveToGlobal={props.onSaveToGlobal}
                onRemoveGlobalValue={props.onRemoveGlobalValue}
                onRowContextMenu={handleRowContextMenu}
                onHeaderContextMenu={handleHeaderContextMenu}
                onUpdateConfig={handleUpdateConfig}
                onReorderRecord={handleReorderRecord}
                readonly={props.readonly}
            />
        </div>
    );
};

export class MarkdownDBView extends TextFileView implements IMarkdownDBView {
    root: Root | null = null;
    fileContent: string = "";
    plugin: MarkdownDBPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MarkdownDBPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_MARKDOWN_DB;
    }

    getDisplayText() {
        return this.file ? this.file.basename : "Database";
    }

    getViewData() {
        return this.fileContent;
    }

    setViewData(data: string, clear: boolean) {
        this.fileContent = data;
        this.refresh();
    }

    clear() {
        this.fileContent = "";
        this.refresh();
    }

    async onOpen() {
        this.contentEl.empty();
        const reactContainer = this.contentEl.createDiv();
        this.root = createRoot(reactContainer);
        this.refresh();

        this.registerDomEvent(reactContainer, 'mouseover', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.matches('.internal-link')) {
                this.app.workspace.trigger('hover-link', {
                    event,
                    source: VIEW_TYPE_MARKDOWN_DB,
                    hoverParent: this,
                    targetEl: target,
                    linktext: target.getAttribute('data-href'),
                    sourcePath: this.file?.path || "",
                });
            }
        });
    }

    async onClose() {
        if (this.root) {
            this.root.unmount();
        }
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

        // Only add to file
        await addPropertyToAllRecords(this.app, this.file, name, type);

        const dbData = parseFile(this.fileContent);
        
        // Update column types
        const newTypes = { ...(dbData.config.columnTypes || {}), [name]: type };
        await updateConfig(this.app, this.file, "db-column-types", JSON.stringify(newTypes));

    }

    handleSaveToGlobal = async (name: string, type?: PropertyType) => {
        const newProps = [...this.plugin.settings.properties];
        const existingIndex = newProps.findIndex(p => p.name === name);
        
        if (existingIndex >= 0) {
            if (type && newProps[existingIndex].type !== type) {
                newProps[existingIndex] = { ...newProps[existingIndex], type };
            }
        } else {
            newProps.push({
                name,
                type: type || "text",
                values: [],
                ignoredValues: []
            });
        }
        
        this.plugin.settings.properties = newProps;
        await this.plugin.saveSettings();
        this.refresh();
    }

    handleRemoveGlobalValue = async (key: string, value: string) => {
        const newProps = [...this.plugin.settings.properties];
        const propIndex = newProps.findIndex(p => p.name === key);
        
        if (propIndex >= 0) {
            const prop = newProps[propIndex];
            newProps[propIndex] = {
                ...prop,
                values: prop.values.filter(v => v !== value)
            };
            this.plugin.settings.properties = newProps;
            await this.plugin.saveSettings();
            this.refresh();
        }
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

    splitLeaf: WorkspaceLeaf | null = null;

    isLeafAttached(leaf: WorkspaceLeaf): boolean {
        let found = false;
        this.app.workspace.iterateAllLeaves(l => {
            if (l === leaf) found = true;
        });
        return found;
    }

    handleOpenRecord = async (record: DatabaseRecord, config: DatabaseConfig) => {
        if (!this.file) return;

        const mode = config.openMode;

        if (mode === "modal") {
            new RecordModal(this.app, this.file, record).open();
        } else if (mode === "split") {
            let leaf = this.splitLeaf;

            // Verify if leaf is valid
            if (!leaf || !this.isLeafAttached(leaf)) {
                leaf = this.app.workspace.getLeaf('split', 'vertical');
                this.splitLeaf = leaf;
            }

            await leaf.openFile(this.file, {
                state: { mode: "source" },
                eState: { line: record.lineStart }
            });
        } else {
            // Default to current tab (mode === "tab")
            await this.leaf.openFile(this.file, {
                state: { mode: "source" },
                eState: { line: record.lineStart }
            });
        }
    }

    handleRowContextMenu = (record: DatabaseRecord, event: React.MouseEvent) => {
        // Prevent default browser context menu
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
        // Prevent default browser context menu
        event.preventDefault();

        const menu = new Menu();

        menu.addItem((item) => {
            item
                .setTitle("Rename property")
                .setIcon("pencil")
                .onClick(() => {
                    new RenameModal(this.app, key, async (newName) => {
                        if (newName && newName !== key && this.file) {
                             await renamePropertyInAllRecords(this.app, this.file, key, newName);
                             
                             // Update config columnTypes
                             if (config?.columnTypes && config.columnTypes[key]) {
                                 const type = config.columnTypes[key];
                                 const newTypes = { ...config.columnTypes };
                                 delete newTypes[key];
                                 newTypes[newName] = type;
                                 await updateConfig(this.app, this.file, "db-column-types", JSON.stringify(newTypes), viewName);
                             }
                             
                             // Update config columnOrder
                             if (config?.columnOrder && config.columnOrder.includes(key)) {
                                 const newOrder = config.columnOrder.map(k => k === key ? newName : k);
                                 await updateConfig(this.app, this.file, "db-columns", JSON.stringify(newOrder), viewName);
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
                        this.refresh();
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
                        
                        await updateConfig(this.app, this.file, "db-hide-columns", JSON.stringify(newHidden), viewName);
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
                                            await updateConfig(this.app, this.file, "db-hide-columns", JSON.stringify(newHidden), viewName);
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
                        await deletePropertyFromAllRecords(this.app, this.file, key);
                        new Notice(`Property "${key}" deleted`);
                    }
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }

    refresh() {
        if (this.root) {
            this.root.render(
                React.createElement(MarkdownDBApp, {
                    fileContent: this.fileContent,
                    file: this.file,
                    view: this,
                    globalProperties: this.plugin.settings.properties,
                    onSaveToGlobal: this.handleSaveToGlobal,
                    onRemoveGlobalValue: this.handleRemoveGlobalValue,
                    component: this
                })
            );
        }
    }
}