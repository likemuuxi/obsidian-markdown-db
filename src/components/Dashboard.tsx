import * as React from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import { App, TFile, setIcon, Notice, Menu, normalizePath } from "obsidian";
import { TableView } from "./TableView";
import { Toolbar } from "./Toolbar";
import { RecordModal } from "./RecordModal";
import { DatabaseData, DatabaseRecord, DatabaseConfig } from "../database/schema";
import { parseFile } from "../database/parser";
import { PropertyType } from "../database/schema";
import { PropertyConfig } from "../settings";
import MyPlugin from "../main";
import { RenameModal } from "../modals/RenameModal";
import { CreateDatabaseModal } from "../modals/CreateDatabaseModal";
import { 
    updateProperty, 
    renameRecord, 
    addRecord, 
    updateConfig, 
    deleteRecord, 
    updateContent, 
    addPropertyToAllRecords, 
    deletePropertyFromAllRecords, 
    updateTitle,
    reorderRecords,
    renamePropertyInAllRecords
} from "../database/writer";

interface DashboardProps {
    app: App;
    plugin: MyPlugin;
    onClose: () => void;
    portalContainer?: HTMLElement;
}

export const Dashboard: React.FC<DashboardProps> = ({ app, plugin, onClose, portalContainer }) => {
    const [globalProperties, setGlobalProperties] = useState<PropertyConfig[]>(plugin.settings.properties);

    const onSaveToGlobal = async (name: string, type?: PropertyType) => {
        const newProps = [...plugin.settings.properties];
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
        
        plugin.settings.properties = newProps;
        await plugin.saveSettings();
        setGlobalProperties(newProps);
    };

    const onRemoveGlobalValue = async (key: string, value: string) => {
        const newProps = [...plugin.settings.properties];
        const propIndex = newProps.findIndex(p => p.name === key);
        
        if (propIndex >= 0) {
            const prop = newProps[propIndex];
            newProps[propIndex] = {
                ...prop,
                values: prop.values.filter(v => v !== value)
            };
            plugin.settings.properties = newProps;
            await plugin.saveSettings();
            setGlobalProperties(newProps);
        }
    };

    const [files, setFiles] = useState<TFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<TFile | null>(null);
    const [dbData, setDbData] = useState<DatabaseData | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Load DB files on mount
    useEffect(() => {
        const allFiles = app.vault.getMarkdownFiles();
        // Filter for potential DB files (e.g. contain markdown-db frontmatter or just all markdown?)
        // For now, let's include all markdown files but prioritize those with frontmatter if we could check efficiently.
        // Reading all files is expensive.
        // Let's just list all markdown files for now, or maybe cache metadata.
        // Better: Check obsidian metadata cache for 'markdown-db' property?
        
        const dbFiles = allFiles.filter(file => {
            const cache = app.metadataCache.getFileCache(file);
            return cache?.frontmatter?.["markdown-db"] === true;
        });

        // If no explicit DB files found, maybe fallback to all markdown files or let user browse?
        // The user said "Left DB files". Let's stick to explicit DB files for "Projects" feel, 
        // but maybe allow "All Files" mode?
        // Let's stick to files with `markdown-db: true` to keep it clean as "Projects".
        // If list is empty, maybe show all files?
        
        if (dbFiles.length > 0) {
            setFiles(dbFiles);
            
            // Check last opened
            const lastOpenedPath = plugin.settings.lastOpenedDbPath;
            const lastOpenedFile = lastOpenedPath ? dbFiles.find(f => f.path === lastOpenedPath) : null;
            
            if (lastOpenedFile) {
                setSelectedFile(lastOpenedFile);
            } else if (!selectedFile) {
                setSelectedFile(dbFiles[0]);
            }
        } else {
            // Fallback: show all markdown files if no DBs defined
             setFiles(allFiles);
             if (!selectedFile && allFiles.length > 0) setSelectedFile(allFiles[0]);
        }
    }, []);

    // Save last opened when selectedFile changes
    useEffect(() => {
        if (selectedFile) {
            plugin.settings.lastOpenedDbPath = selectedFile.path;
            plugin.saveSettings();
        }
    }, [selectedFile]);

    // Load file content when selected
    useEffect(() => {
        const loadFile = async () => {
            if (!selectedFile) return;
            setLoading(true);
            try {
                const content = await app.vault.read(selectedFile);
                const data = parseFile(content);
                if (!data.title) data.title = selectedFile.basename;
                setDbData(data);
            } catch (e) {
                console.error("Failed to load file", e);
                new Notice("Failed to load database file");
            } finally {
                setLoading(false);
            }
        };
        loadFile();
    }, [selectedFile]);

    // Helper to reload current file
    const reloadCurrentFile = async () => {
        if (!selectedFile) return;
        const content = await app.vault.read(selectedFile);
        const data = parseFile(content);
        if (!data.title) data.title = selectedFile.basename;
        setDbData(data);
    };

    // --- Writer Handlers ---
    const handleUpdateProperty = async (record: DatabaseRecord, key: string, value: string, explicitType?: string) => {
        if (selectedFile) {
            await updateProperty(app, selectedFile, record, key, value, explicitType);
            await reloadCurrentFile();
        }
    };

    const handleUpdateContent = async (record: DatabaseRecord, newContent: string) => {
        if (selectedFile) {
            await updateContent(app, selectedFile, record, newContent);
            await reloadCurrentFile();
        }
    };

    const handleReorderRecord = async (fromIndex: number, toIndex: number) => {
        if (selectedFile) {
            // new Notice(`Moving record from ${fromIndex} to ${toIndex}`);
            await reorderRecords(app, selectedFile, fromIndex, toIndex);
            await reloadCurrentFile();
        }
    };

    const handleRenameRecord = async (record: DatabaseRecord, newName: string) => {
        if (selectedFile) {
            await renameRecord(app, selectedFile, record.title, newName);
            await reloadCurrentFile();
        }
    };

    const handleAddRecord = async () => {
        if (selectedFile) {
            await addRecord(app, selectedFile, "Untitled");
            await reloadCurrentFile();
        }
    };

    const handleAddProperty = async (name: string, type: PropertyType = "text") => {
        if (selectedFile) {
            await addPropertyToAllRecords(app, selectedFile, name, type, "");
            
            // Update column types in config
            if (dbData) {
                const newTypes = { ...(dbData.config.columnTypes || {}), [name]: type };
                await updateConfig(app, selectedFile, "db-column-types", JSON.stringify(newTypes));
            }
            
            await reloadCurrentFile();
        }
    };

    const handleUpdateConfig = async (key: string, value: string) => {
        if (selectedFile) {
            await updateConfig(app, selectedFile, key, value);
            await reloadCurrentFile();
        }
    };

    const handleUpdateTitle = async (newTitle: string) => {
        if (selectedFile) {
            await updateTitle(app, selectedFile, newTitle);
            await reloadCurrentFile();
        }
    };

    const handleRowContextMenu = (record: DatabaseRecord, event: React.MouseEvent) => {
        const menu = new Menu();
        
        menu.addItem((item) => {
            item
                .setTitle("Delete")
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    if (selectedFile) {
                        await deleteRecord(app, selectedFile, record);
                        await reloadCurrentFile();
                        new Notice("Record deleted");
                    }
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    };

    // Filtered records for view
    const filteredRecords = useMemo(() => {
        if (!dbData) return [];
        if (!searchTerm) return dbData.records;
        const lowerTerm = searchTerm.toLowerCase();
        return dbData.records.filter(r =>
            r.title.toLowerCase().includes(lowerTerm) ||
            Object.values(r.properties).some(vals => vals.some(v => String(v.value).toLowerCase().includes(lowerTerm))) ||
            (r.content && r.content.toLowerCase().includes(lowerTerm))
        );
    }, [dbData, searchTerm]);

    const displayData = dbData ? { ...dbData, records: filteredRecords } : null;

    const handleHeaderContextMenu = (key: string, event: React.MouseEvent) => {
        const menu = new Menu();

        menu.addItem((item) => {
            item
                .setTitle("Rename property")
                .setIcon("pencil")
                .onClick(() => {
                    new RenameModal(app, key, async (newName) => {
                        if (newName && newName !== key && selectedFile) {
                             await renamePropertyInAllRecords(app, selectedFile, key, newName);
                             
                             // Update config columnTypes
                             if (dbData?.config.columnTypes && dbData.config.columnTypes[key]) {
                                 const type = dbData.config.columnTypes[key];
                                 const newTypes = { ...dbData.config.columnTypes };
                                 delete newTypes[key];
                                 newTypes[newName] = type;
                                 await updateConfig(app, selectedFile, "db-column-types", JSON.stringify(newTypes));
                             }
                             
                             // Update config columnOrder
                             if (dbData?.config.columnOrder && dbData.config.columnOrder.includes(key)) {
                                 const newOrder = dbData.config.columnOrder.map(k => k === key ? newName : k);
                                 await updateConfig(app, selectedFile, "db-columns", JSON.stringify(newOrder));
                             }
                             
                             await reloadCurrentFile();
                             new Notice(`Property renamed to "${newName}"`);
                        }
                    }).open();
                });
        });

        const globalProp = globalProperties.find(p => p.name === key);
        if (!globalProp) {
            menu.addItem((item) => {
                item
                    .setTitle("Add to global properties")
                    .setIcon("globe")
                    .onClick(async () => {
                        let type: PropertyType = "text";
                        if (dbData?.config.columnTypes && dbData.config.columnTypes[key]) {
                            type = dbData.config.columnTypes[key];
                        }
                        
                        await onSaveToGlobal(key, type);
                        new Notice(`Property "${key}" added to global settings`);
                    });
            });
        }

        menu.addSeparator();

        menu.addItem((item) => {
            item
                .setTitle("Delete property")
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    if (selectedFile) {
                        await deletePropertyFromAllRecords(app, selectedFile, key);
                        await reloadCurrentFile();
                        new Notice(`Property "${key}" deleted`);
                    }
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    };

    const handleFileContextMenu = (file: TFile, event: React.MouseEvent) => {
        event.preventDefault();
        const menu = new Menu();

        menu.addItem((item) =>
            item
                .setTitle("Rename")
                .setIcon("pencil")
                .onClick(() => {
                    new RenameModal(app, file.basename, async (newName) => {
                        if (newName && newName !== file.basename) {
                            const parentPath = file.parent?.path || "";
                            const newPath = normalizePath(`${parentPath}/${newName}.md`);
                            try {
                                await app.fileManager.renameFile(file, newPath);
                                // Force update as TFile object is mutated in place by Obsidian
                                setFiles([...files]);
                                new Notice(`Renamed to ${newName}`);
                            } catch (e) {
                                new Notice("Failed to rename file");
                                console.error(e);
                            }
                        }
                    }).open();
                })
        );

        menu.addItem((item) =>
            item
                .setTitle("Jump to file")
                .setIcon("external-link")
                .onClick(() => {
                    const leaf = app.workspace.getLeaf("tab");
                    leaf.openFile(file);
                    onClose();
                })
        );
        
        menu.addSeparator();
        
        menu.addItem((item) =>
            item
                .setTitle("Delete")
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    try {
                        await app.vault.trash(file, true);
                        setFiles(files.filter(f => f.path !== file.path));
                        if (selectedFile?.path === file.path) {
                            setSelectedFile(null);
                        }
                        new Notice("File moved to trash");
                    } catch (e) {
                         new Notice("Failed to delete file");
                         console.error(e);
                    }
                })
        );

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    };

    const handleCreateDbFile = async () => {
        new CreateDatabaseModal(app, "Untitled Database", async (filename) => {
            if (!filename) return;
            
            // Ensure extension
            if (!filename.endsWith(".md")) {
                filename += ".md";
            }

            const folderPath = plugin.settings.defaultDbFolder || "";
            // Check if folder exists
            if (folderPath && !(await app.vault.adapter.exists(folderPath))) {
                 // Try to create folder?
                 try {
                    await app.vault.createFolder(folderPath);
                 } catch (e) {
                     new Notice(`Failed to create folder: ${folderPath}`);
                     return;
                 }
            }
            
            let filePath = folderPath ? `${folderPath}/${filename}` : filename;
            
            // Handle duplicates or error if exists
            if (await app.vault.adapter.exists(filePath)) {
                new Notice("File with this name already exists!");
                return;
            }
            
            const initialContent = "---\nmarkdown-db: true\ndb-open-mode: split\ndb-layout: table\n---\n\n# Database\n";
            try {
                const newFile = await app.vault.create(filePath, initialContent);
                setFiles(prev => [...prev, newFile]);
                setSelectedFile(newFile);
                new Notice("New database created");
            } catch (e) {
                new Notice("Failed to create file");
                console.error(e);
            }
        }).open();
    };

    return (
        <div className="markdown-db-dashboard">
            {/* Sidebar */}
            <div className="markdown-db-dashboard-sidebar">
                <div className="markdown-db-sidebar-header">
                    <h3>Database</h3>
                    {/* <button className="markdown-db-icon-btn"><Icon name="plus" /></button> */}
                </div>
                <div className="markdown-db-file-list">
                    {files.map(file => (
                        <div 
                            key={file.path} 
                            className={`markdown-db-file-item ${selectedFile?.path === file.path ? "active" : ""}`}
                            onClick={() => setSelectedFile(file)}
                            onContextMenu={(e) => handleFileContextMenu(file, e)}
                        >
                            <span className="markdown-db-file-icon">📄</span>
                            <span className="markdown-db-file-name">{file.basename}</span>
                            {/* <span className="markdown-db-file-count">12</span> */}
                        </div>
                    ))}
                </div>
                <div className="markdown-db-sidebar-footer">
                    <button className="markdown-db-create-db-btn" onClick={handleCreateDbFile}>
                        + New Database
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="markdown-db-dashboard-main" tabIndex={-1} style={{ outline: "none" }}>
                {selectedFile && displayData ? (
                    <>
                         <Toolbar
                            title={displayData.title}
                            config={displayData.config}
                            onSearch={setSearchTerm}
                            onUpdateConfig={handleUpdateConfig}
                            onAddRecord={handleAddRecord}
                            onUpdateTitle={handleUpdateTitle}
                            allProperties={Array.from(displayData.allKeys)}
                            portalContainer={portalContainer}
                        />
                        <div className="markdown-db-dashboard-view">
                            <TableView
                                app={app}
                                data={displayData}
                                fileName={selectedFile.basename}
                                sourcePath={selectedFile.path}
                                globalProperties={globalProperties}
                                onUpdateProperty={handleUpdateProperty}
                                onUpdateContent={handleUpdateContent}
                                onRenameRecord={handleRenameRecord}
                                onReorderRecord={handleReorderRecord}
                                portalContainer={portalContainer}
                                onOpenRecord={(record) => {
                                    if (selectedFile) {
                                        // Always use modal as requested, ignoring db-open-mode
                                        const modal = new RecordModal(app, selectedFile, record);
                                        const originalOnClose = modal.onClose;
                                        modal.onClose = async () => {
                                            if (originalOnClose) await originalOnClose();
                                            await reloadCurrentFile();
                                        };
                                        modal.open();
                                    }
                                }}
                                onAddRecord={handleAddRecord}
                                onAddProperty={handleAddProperty}
                                onSaveToGlobal={onSaveToGlobal}
                                onRemoveGlobalValue={onRemoveGlobalValue}
                                onRowContextMenu={handleRowContextMenu}
                                onHeaderContextMenu={handleHeaderContextMenu}
                                onUpdateConfig={handleUpdateConfig}
                            />
                        </div>
                    </>
                ) : (
                    <div className="markdown-db-empty-state">
                        Select a database to view
                    </div>
                )}
            </div>
        </div>
    );
};
