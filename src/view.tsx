import { TextFileView, WorkspaceLeaf, TFile, WorkspaceSplit, MarkdownView, Menu } from "obsidian";
import * as React from "react";
import { useState, useMemo } from "react";
import { createRoot, Root } from "react-dom/client";
import { TableView } from "./components/TableView";
import { Toolbar } from "./components/Toolbar";
import { parseFile, DatabaseRecord, DatabaseConfig } from "./database/parser";
import { updateProperty, renameRecord, addRecord, updateConfig, deleteRecord, updateContent, addPropertyToAllRecords, deletePropertyFromAllRecords, updateTitle } from "./database/writer";
import { RecordModal } from "./components/RecordModal";
import { VIEW_TYPE_RECORD_EDIT } from "./views/RecordEditView";
import type MarkdownDBPlugin from "./main";

export const VIEW_TYPE_MARKDOWN_DB = "markdown-db-view";

const MarkdownDBApp = (props: {
    fileContent: string,
    file: TFile | null,
    view: MarkdownDBView,
    knownProperties: string[],
    knownValues: Record<string, string[]>,
    blockStyleProperties: string[],
    onSaveToGlobal: (name: string) => void,
    onRemoveGlobalValue: (key: string, value: string) => void
}) => {
    const dbData = useMemo(() => {
        const data = parseFile(props.fileContent);
        if (!data.title && props.file) {
            data.title = props.file.basename;
        }
        return data;
    }, [props.fileContent, props.file]);

    const [searchTerm, setSearchTerm] = useState("");

    const filteredRecords = useMemo(() => {
        if (!searchTerm) return dbData.records;
        const lowerTerm = searchTerm.toLowerCase();
        return dbData.records.filter(r =>
            r.title.toLowerCase().includes(lowerTerm) ||
            Object.values(r.properties).some(vals => vals.some(v => v.toLowerCase().includes(lowerTerm))) ||
            (r.content && r.content.toLowerCase().includes(lowerTerm))
        );
    }, [dbData.records, searchTerm]);

    const handleUpdateProperty = (record: DatabaseRecord, key: string, value: string) => {
        if (props.file) props.view.handleUpdateProperty(record, key, value);
    };

    const handleUpdateContent = (record: DatabaseRecord, newContent: string) => {
        if (props.file) props.view.handleUpdateContent(record, newContent);
    };

    const handleRenameRecord = (record: DatabaseRecord, newName: string) => {
        if (props.file) props.view.handleRenameRecord(record, newName);
    };

    const handleOpenRecord = (record: DatabaseRecord) => {
        props.view.handleOpenRecord(record, dbData.config);
    };

    const handleAddRecord = () => {
        if (props.file) props.view.handleAddRecord();
    };

    const handleAddProperty = (name: string) => {
        if (props.file) props.view.handleAddProperty(name);
    };

    const handleUpdateConfig = (key: string, value: string) => {
        if (props.file) props.view.handleUpdateConfig(key, value);
    };

    const handleUpdateTitle = (newTitle: string) => {
        if (props.file) props.view.handleUpdateTitle(newTitle);
    };

    const handleRowContextMenu = (record: DatabaseRecord, event: React.MouseEvent) => {
        props.view.handleRowContextMenu(record, event);
    };

    const handleHeaderContextMenu = (key: string, event: React.MouseEvent) => {
        props.view.handleHeaderContextMenu(key, event);
    };

    // Override data records with filtered ones for display
    const displayData = { ...dbData, records: filteredRecords };

    return (
        <div className="markdown-db-container">
            <Toolbar
                title={dbData.title}
                config={dbData.config}
                onSearch={setSearchTerm}
                onUpdateConfig={handleUpdateConfig}
                onAddRecord={handleAddRecord}
                onUpdateTitle={handleUpdateTitle}
                allProperties={Array.from(dbData.allKeys)}
            />
            <TableView
                app={props.view.app}
                data={displayData}
                fileName={props.file?.basename}
                sourcePath={props.file?.path}
                knownProperties={props.knownProperties}
                knownValues={props.knownValues}
                blockStyleProperties={props.blockStyleProperties}
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
            />
        </div>
    );
};

export class MarkdownDBView extends TextFileView {
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

    handleUpdateProperty = async (record: DatabaseRecord, key: string, value: string) => {
        if (this.file) {
            await updateProperty(this.app, this.file, record, key, value);
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
            await addRecord(this.app, this.file);
        }
    }

    handleAddProperty = async (name: string) => {
        if (!this.file) return;

        // Only add to file
        await addPropertyToAllRecords(this.app, this.file, name, "");
    }

    handleSaveToGlobal = async (name: string) => {
        if (!this.plugin.settings.knownProperties.includes(name)) {
            this.plugin.settings.knownProperties.push(name);
            await this.plugin.saveSettings();
            this.refresh();
        }
    }

    handleRemoveGlobalValue = async (key: string, value: string) => {
        if (this.plugin.settings.propertyValues[key]) {
            this.plugin.settings.propertyValues[key] = this.plugin.settings.propertyValues[key].filter(v => v !== value);
            await this.plugin.saveSettings();
            this.refresh();
        }
    }

    handleUpdateConfig = async (key: string, value: string) => {
        if (this.file) {
            await updateConfig(this.app, this.file, key, value);
        }
    }

    handleUpdateTitle = async (newTitle: string) => {
        if (this.file) {
            await updateTitle(this.app, this.file, newTitle);
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

    handleHeaderContextMenu = (key: string, event: React.MouseEvent) => {
        // Prevent default browser context menu
        event.preventDefault();

        const menu = new Menu();

        const blockStyles = this.plugin.settings.blockStyleProperties || [];
        const isBlock = blockStyles.includes(key);

        menu.addItem((item) => {
            item
                .setTitle(isBlock ? "Render as Text" : "Render as Tags")
                .setIcon(isBlock ? "text-cursor" : "tag")
                .onClick(async () => {
                    let newStyles = [...blockStyles];
                    if (isBlock) {
                        newStyles = newStyles.filter(k => k !== key);
                    } else {
                        newStyles.push(key);
                    }
                    
                    this.plugin.settings.blockStyleProperties = newStyles;
                    await this.plugin.saveSettings();
                    this.refresh();
                });
        });

        menu.addItem((item) => {
            item
                .setTitle(`Delete property "${key}"`)
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    if (this.file) {
                        await deletePropertyFromAllRecords(this.app, this.file, key);
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
                    knownProperties: this.plugin.settings.knownProperties,
                    knownValues: this.plugin.settings.propertyValues,
                    blockStyleProperties: this.plugin.settings.blockStyleProperties,
                    onSaveToGlobal: this.handleSaveToGlobal,
                    onRemoveGlobalValue: this.handleRemoveGlobalValue
                })
            );
        }
    }
}
