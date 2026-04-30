import * as React from "react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { App, TFile, setIcon, Notice, Menu, normalizePath, TFolder } from "obsidian";
import { FileTree } from "./FileTree";
import { CreateFolderModal } from "../modals/CreateFolderModal";
import { TableView } from "./TableView";
import { Toolbar } from "./Toolbar";
import { RecordModal } from "../modals/RecordModal";
import { DatabaseData, DatabaseRecord, DatabaseConfig, FilterRule, SortRule } from "../database/schema";
import { parseFile } from "../database/parser";
import { PropertyType } from "../database/schema";
import { PropertyConfig } from "../settings";
import type MyPlugin from "../main";
import { VIEW_TYPE_MARKDOWN_DB } from "../views/view";
import { RenameModal } from "../modals/RenameModal";
import { CreateDatabaseModal } from "../modals/CreateDatabaseModal";
import { TemplateSuggestModal } from "../modals/TemplateSuggestModal";
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
    renamePropertyInAllRecords,
    deleteView,
    renameView,
    reorderViews
} from "../database/writer";

const Icon = ({ name, className }: { name: string; className?: string }) => {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.empty();
            setIcon(ref.current, name);
        }
    }, [name]);

    return <span ref={ref} className={className} style={{ display: "flex", alignItems: "center" }} />;
};

interface DashboardProps {
    app: App;
    plugin: MyPlugin;
    onClose: () => void;
    portalContainer?: HTMLElement;
    component?: any;
}

export const Dashboard: React.FC<DashboardProps> = ({ app, plugin, onClose, portalContainer, component }) => {
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
    const [folders, setFolders] = useState<TFolder[]>([]);
    const [selectedFile, setSelectedFile] = useState<TFile | null>(null);
    const [dbData, setDbData] = useState<DatabaseData | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentView, setCurrentView] = useState<string | null>(null);
    const [templates, setTemplates] = useState<string[]>(plugin.settings.templates);
    const [isTableSelectionMode, setIsTableSelectionMode] = useState(false);
    const clearTableSelectionRef = useRef<(() => void) | null>(null);

    // Reset view when file changes
    useEffect(() => {
        setCurrentView(null);
    }, [selectedFile]);

    // Load DB files on mount
    // Load DB files on mount
    const refreshFiles = useCallback(() => {
        const allFiles = app.vault.getMarkdownFiles();
        const allLoaded = app.vault.getAllLoadedFiles();
        const defaultDbFolder = plugin.settings.defaultDbFolder;

        const dbFiles = allFiles.filter(file => {
            if (defaultDbFolder && !file.path.startsWith(defaultDbFolder)) {
                return false;
            }
            const cache = app.metadataCache.getFileCache(file);
            return cache?.frontmatter?.["markdown-db"] === true;
        });

        const allFolders = allLoaded.filter(f => f instanceof TFolder) as TFolder[];
        const validFolders = defaultDbFolder
            ? allFolders.filter(f => f.path.startsWith(defaultDbFolder))
            : allFolders;

        setFolders(validFolders);

        if (dbFiles.length > 0) {
            setFiles(dbFiles);
        } else {
            const filesInFolder = defaultDbFolder
                ? allFiles.filter(f => f.path.startsWith(defaultDbFolder))
                : allFiles;
            setFiles(filesInFolder);
        }
    }, [plugin.settings.defaultDbFolder]);

    useEffect(() => {
        refreshFiles();

        // Initial selection logic separate from refresh
        const allFiles = app.vault.getMarkdownFiles();
        const defaultDbFolder = plugin.settings.defaultDbFolder;
        const dbFiles = allFiles.filter(file => {
            if (defaultDbFolder && !file.path.startsWith(defaultDbFolder)) return false;
            const cache = app.metadataCache.getFileCache(file);
            return cache?.frontmatter?.["markdown-db"] === true;
        });

        if (dbFiles.length > 0) {
            const lastOpenedPath = sessionStorage.getItem('markdown-db-last-opened');
            const lastOpenedFile = lastOpenedPath ? dbFiles.find(f => f.path === lastOpenedPath) : null;
            if (lastOpenedFile) setSelectedFile(lastOpenedFile);
            else if (!selectedFile) setSelectedFile(dbFiles[0]);
        } else {
            const filesInFolder = defaultDbFolder ? allFiles.filter(f => f.path.startsWith(defaultDbFolder)) : allFiles;
            if (!selectedFile && filesInFolder.length > 0) setSelectedFile(filesInFolder[0]);
        }

        const events = [
            app.vault.on("create", refreshFiles),
            app.vault.on("delete", refreshFiles),
            app.vault.on("rename", refreshFiles)
        ];

        return () => {
            events.forEach(ref => app.vault.offref(ref));
        };
    }, [plugin.settings.defaultDbFolder, refreshFiles]);

    // Save last opened when selectedFile changes
    useEffect(() => {
        if (selectedFile) {
            sessionStorage.setItem('markdown-db-last-opened', selectedFile.path);
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

    // --- View Handlers ---
    const handleSwitchView = (name: string | null) => {
        setCurrentView(name);
    };

    const handleAddView = async (name: string, config: { openMode: string, showContent: boolean, contentHeight: string, filters: FilterRule[], sorts: SortRule[] }) => {
        if (!selectedFile || !dbData || !name) return;

        // Check for duplicate names
        let newName = name;
        const existingViews = dbData.views ? Object.keys(dbData.views) : [];
        let index = 1;
        const originalName = newName;

        while (existingViews.includes(newName)) {
            newName = `${originalName} ${index}`;
            index++;
        }

        // Initialize with user selected configs sequentially
        await updateConfig(app, selectedFile, "db-open-mode", config.openMode, newName);
        await updateConfig(app, selectedFile, "db-show-content", config.showContent ? "true" : "false", newName);
        await updateConfig(app, selectedFile, "db-content-height", config.contentHeight, newName);

        if (config.filters && config.filters.length > 0) {
            await updateConfig(app, selectedFile, "db-filter", JSON.stringify(config.filters), newName);
        }

        if (config.sorts && config.sorts.length > 0) {
            await updateConfig(app, selectedFile, "db-sort", JSON.stringify(config.sorts), newName);
        }

        await reloadCurrentFile();
        setCurrentView(newName);
    };

    const handleRenameView = async (oldName: string, newName: string) => {
        if (selectedFile) {
            await renameView(app, selectedFile, oldName, newName);
            await reloadCurrentFile();
            if (currentView === oldName) {
                setCurrentView(newName);
            }
        }
    };

    const handleDeleteView = async (name: string) => {
        if (selectedFile) {
            await deleteView(app, selectedFile, name);
            await reloadCurrentFile();
            if (currentView === name) {
                setCurrentView(null);
            }
        }
    };

    const handleReorderViews = async (names: string[]) => {
        if (selectedFile) {
            await reorderViews(app, selectedFile, names);
            await reloadCurrentFile();
        }
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

    const handleAddRecord = async (templatePath?: string) => {
        if (selectedFile) {
            let initialProperties: Record<string, any> = {};

            if (templatePath) {
                const templateFile = app.vault.getAbstractFileByPath(templatePath);
                if (templateFile instanceof TFile) {
                    const cache = app.metadataCache.getFileCache(templateFile);

                    // 1. Frontmatter
                    if (cache?.frontmatter) {
                        const { position, ...rest } = cache.frontmatter;
                        initialProperties = { ...initialProperties, ...rest };
                    }

                    // 2. Inline fields (Simple Parsing)
                    try {
                        const content = await app.vault.read(templateFile);
                        // Regex to find [key::value] or [key::type(value)]
                        // Note: This is a basic extraction. 
                        const regex = /\[\s*([\w\s-_]+)\s*::\s*(.*?)\s*\]/g;
                        let match;
                        while ((match = regex.exec(content)) !== null) {
                            const key = match[1].trim();
                            const rawValue = match[2].trim();

                            // Check if it has type info e.g. text(value)
                            const typeMatch = rawValue.match(/^([a-zA-Z]+)\s*\((.*)\)$/);
                            if (typeMatch) {
                                const type = typeMatch[1].toLowerCase();
                                const valStr = typeMatch[2];
                                if (type === "number") {
                                    initialProperties[key] = parseFloat(valStr);
                                } else if (type === "boolean") {
                                    initialProperties[key] = valStr.toLowerCase() === "true";
                                } else {
                                    initialProperties[key] = valStr;
                                }
                            } else {
                                // Try to infer type
                                if (rawValue.toLowerCase() === "true" || rawValue.toLowerCase() === "false") {
                                    initialProperties[key] = rawValue.toLowerCase() === "true";
                                } else if (!isNaN(Number(rawValue)) && rawValue.trim() !== "") {
                                    initialProperties[key] = Number(rawValue);
                                } else {
                                    initialProperties[key] = rawValue;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Failed to read template file", e);
                    }
                }
            }

            await addRecord(app, selectedFile, "Untitled", initialProperties);
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
            await updateConfig(app, selectedFile, key, value, currentView || undefined);
            await reloadCurrentFile();
        }
    };

    const handleUpdateTitle = async (newTitle: string) => {
        if (selectedFile) {
            const currentName = selectedFile.basename;
            const suffixMatch = currentName.match(/(\s*\(.*\))|(\s*（.*）)$/);
            const suffix = suffixMatch ? suffixMatch[0] : "";

            const newFilename = `${newTitle}${suffix}`;

            if (newFilename !== currentName) {
                const parentPath = selectedFile.parent?.path || "";
                const newPath = normalizePath(`${parentPath}/${newFilename}.md`);

                try {
                    await app.fileManager.renameFile(selectedFile, newPath);
                } catch (e) {
                    new Notice("Failed to rename file");
                    console.error(e);
                }
            }

            // Always update H1 in file to ensure sync
            await updateTitle(app, selectedFile, newTitle);
            await reloadCurrentFile();
        }
    };

    const handleAddTemplate = () => {
        new TemplateSuggestModal(plugin, (file) => {
            setTemplates([...plugin.settings.templates]);
        }).open();
    };

    const handleRemoveTemplate = async (path: string) => {
        plugin.settings.templates = plugin.settings.templates.filter(t => t !== path);
        await plugin.saveSettings();
        setTemplates([...plugin.settings.templates]);
    };

    const handleRowContextMenu = (record: DatabaseRecord, selectedRecords: DatabaseRecord[], event: React.MouseEvent) => {
        const menu = new Menu();

        if (selectedFile) {
            const syncConfig = plugin.notionSyncService?.getSyncConfigForFile(selectedFile);
            if (syncConfig && !plugin.notionSyncService?.isSyncing) {
                const direction = syncConfig.syncDirection || 'push';
                menu.addItem((item) => {
                    item
                        .setTitle(direction === 'pull' ? "Pull from Notion" : "Push to Notion")
                        .setIcon("refresh-cw")
                        .onClick(async () => {
                            plugin.notionSyncService.setSyncStatus(true);
                            try {
                                if (record.properties['notionUrl'] && record.properties['notionUrl'].length > 0) {
                                    await plugin.notionSyncService.syncPage(String(record.properties['notionUrl'][0].value), syncConfig, selectedFile, record);
                                } else {
                                    await plugin.notionSyncService.syncByTitle(record, syncConfig, selectedFile);
                                }
                            } finally {
                                plugin.notionSyncService.setSyncStatus(false);
                                await reloadCurrentFile();
                            }
                        });
                });
            }
        }

        menu.addItem((item) => {
            item
                .setTitle(selectedRecords.length > 1 ? `Delete ${selectedRecords.length} records` : "Delete")
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    if (selectedFile) {
                        const recordsToDelete = selectedRecords.length > 0 ? selectedRecords : [record];
                        const sortedRecords = [...recordsToDelete].sort((a, b) => b.lineStart - a.lineStart);

                        for (const targetRecord of sortedRecords) {
                            await deleteRecord(app, selectedFile, targetRecord);
                        }

                        await reloadCurrentFile();
                        new Notice(recordsToDelete.length > 1 ? `${recordsToDelete.length} records deleted` : "Record deleted");
                    }
                });
        });

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    };

    const currentConfig = useMemo(() => {
        if (!dbData) return {} as DatabaseConfig;
        if (!currentView) return dbData.config;
        return dbData.views?.[currentView] || dbData.config;
    }, [dbData, currentView]);

    // Filtered records for view (Search only, filters/sorts applied by TableView based on config)
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

    const displayData = useMemo(() => {
        if (!dbData) return null;
        return {
            ...dbData,
            config: currentConfig,
            records: filteredRecords
        };
    }, [dbData, currentConfig, filteredRecords]);

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

        menu.addItem((item) => {
            item
                .setTitle("Hide property")
                .setIcon("eye-off")
                .onClick(async () => {
                    if (selectedFile && dbData) {
                        const currentHidden = dbData.config.hiddenColumns || [];
                        const newHidden = [...currentHidden, key];

                        await updateConfig(app, selectedFile, "db-hide-columns", JSON.stringify(newHidden));
                        await reloadCurrentFile();
                    }
                });
        });

        if (dbData) {
            const hiddenColumns = dbData.config.hiddenColumns || [];
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
                                    if (selectedFile) {
                                        const newHidden = hiddenColumns.filter(k => k !== hiddenKey);
                                        await updateConfig(app, selectedFile, "db-hide-columns", JSON.stringify(newHidden));
                                        await reloadCurrentFile();
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
                .onClick(async () => {
                    onClose();
                    const leaf = app.workspace.getLeaf("tab");
                    await leaf.openFile(file);
                    await leaf.setViewState({
                        type: VIEW_TYPE_MARKDOWN_DB,
                        state: { file: file.path }
                    });
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



    const handleCreateDbFile = async (folderPath?: string) => {
        new CreateDatabaseModal(app, "Untitled Database", async (filename) => {
            if (!filename) return;

            // Ensure extension
            if (!filename.endsWith(".md")) {
                filename += ".md";
            }

            const basePath = folderPath || plugin.settings.defaultDbFolder || "";
            // Check if folder exists
            if (basePath && basePath !== "/" && !(await app.vault.adapter.exists(basePath))) {
                // Try to create folder?
                try {
                    await app.vault.createFolder(basePath);
                } catch (e) {
                    new Notice(`Failed to create folder: ${basePath}`);
                    return;
                }
            }

            let filePath = basePath ? `${basePath}/${filename}` : filename;
            if (basePath === "/") filePath = filename; // Root handling

            // Handle duplicates or error if exists
            if (await app.vault.adapter.exists(filePath)) {
                new Notice("File with this name already exists!");
                return;
            }

            const title = filename.replace(/\.md$/, "").split("(")[0].trim();
            const initialContent = `---\nmarkdown-db: true\n---\n\n# ${title}\n`;
            try {
                const newFile = await app.vault.create(filePath, initialContent);
                setFiles(prev => [...prev, newFile]);
                setSelectedFile(newFile);
                new Notice("New database created");
            } catch (e) {
                new Notice("Failed to create file");
                console.error(e);
            }
        }, folderPath).open();
    };

    const handleCreateFolder = (parentPath: string) => {
        new CreateFolderModal(app, async (folderName) => {
            // Validate and Create
            if (!folderName) return;
            const newPath = parentPath ? `${parentPath}/${folderName}` : folderName;

            try {
                if (await app.vault.adapter.exists(newPath)) {
                    new Notice("Folder already exists");
                    return;
                }
                await app.vault.createFolder(newPath);
                new Notice("Folder created");

                // Trigger refresh immediately
                refreshFiles();
            } catch (e) {
                new Notice("Failed to create folder");
                console.error(e);
            }
        }).open();
    };

    const handleFolderContextMenu = (folderPath: string, event: React.MouseEvent) => {
        const menu = new Menu();

        menu.addItem((item) =>
            item
                .setTitle("New Database")
                .setIcon("plus")
                .onClick(() => {
                    handleCreateDbFile(folderPath);
                })
        );

        menu.addItem((item) =>
            item
                .setTitle("New Folder")
                .setIcon("folder-plus")
                .onClick(() => {
                    handleCreateFolder(folderPath);
                })
        );

        menu.addSeparator();

        menu.addItem((item) => {
            item
                .setTitle("Rename")
                .setIcon("pencil")
                .onClick(() => {
                    // Get folder name from path
                    const folderName = folderPath.split("/").pop() || "";
                    new RenameModal(app, folderName, async (newName) => {
                        if (newName && newName !== folderName) {
                            const parentPath = folderPath.substring(0, folderPath.lastIndexOf("/"));
                            const newPath = parentPath ? `${parentPath}/${newName}` : newName;
                            try {
                                await app.vault.adapter.rename(folderPath, newPath);
                                new Notice(`Renamed to ${newName}`);
                                // Rely on reactive updates if implemented, otherwise manual refresh might be needed
                            } catch (e) {
                                new Notice("Failed to rename folder");
                                console.error(e);
                            }
                        }
                    }).open();
                });
        });

        menu.addItem((item) =>
            item
                .setTitle("Delete")
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    try {
                        await app.vault.adapter.trashLocal(folderPath); // Or trash(folder)
                        new Notice("Folder moved to trash");
                    } catch (e) {
                        new Notice("Failed to delete folder");
                        console.error(e);
                    }
                })
        );

        menu.showAtPosition({ x: event.clientX, y: event.clientY });
    };

    return (
        <div className="markdown-db-dashboard">
            {/* Sidebar */}
            <div
                className="markdown-db-dashboard-sidebar"
                onMouseDown={() => {
                    if (!isTableSelectionMode) {
                        return;
                    }

                    clearTableSelectionRef.current?.();
                }}
            >
                <div className="markdown-db-sidebar-header">
                    <h3>Database</h3>
                    {/* <button className="markdown-db-icon-btn"><Icon name="plus" /></button> */}
                </div>
                <div className="markdown-db-file-list">
                    <FileTree
                        files={files}
                        folders={folders}
                        // Pass all folders if we want to show empty ones, for now inferred from files + maybe defaultDbFolder?
                        // To properly support "Create Folder", we should pass all relevant folders.
                        rootPath={plugin.settings.defaultDbFolder}
                        selectedFile={selectedFile}
                        onSelect={setSelectedFile}

                        onOpenFile={async (file) => {
                            onClose();
                            const leaf = app.workspace.getLeaf("tab");
                            await leaf.openFile(file);
                            await leaf.setViewState({
                                type: VIEW_TYPE_MARKDOWN_DB,
                                state: { file: file.path }
                            });
                        }}
                        onFileContextMenu={handleFileContextMenu}
                        onFolderContextMenu={handleFolderContextMenu}
                        onMoveFile={async (file, newPath) => {
                            try {
                                await app.fileManager.renameFile(file, newPath);
                                // The vault listener or refresh logic will pick this up
                                // But since we manage `files` state manually in useEffect,
                                // we might need to trigger a refresh or let the reactive updates handle it.
                                // Actually Dashboard useEffect depends on `defaultDbFolder`, not file events.
                                // We might need to manually update state or force re-render.
                                // Quick fix: update files state optimistically or re-fetch.

                                // Let's rely on standard React updates - if we modify `files` state?
                                // Actually better to re-run the fetch.
                                // How to trigger re-fetch?
                                // We can extract the fetch logic to a function and call it.
                                // For now, let's just update `files` state locally to reflect the move immediately if possible,
                                // or better, just `setFiles(prev => ...)` 

                                // Actually, `app.fileManager.renameFile` modifies the TFile in place? 
                                // Obsidian API says: "Renames or moves a file".
                                // If we just wait a bit, maybe `getMarkdownFiles` returns updated paths?
                                new Notice(`Moved to ${newPath}`);

                                // Force refresh
                                const allFiles = app.vault.getMarkdownFiles();
                                // Re-filter... this is duplicating logic from useEffect.
                                // Ideally we should have a `refresh` function.
                                // But since `files` state drives the tree, and `files` array contains `TFile` objects which strictly speaking *should* update their path property...
                                // Let's try just forcing a re-render by creating a new array ref.
                                setFiles([...files]);
                            } catch (e) {
                                new Notice("Failed to move file");
                                console.error(e);
                            }
                        }}
                    />
                </div>
                <div className="markdown-db-sidebar-footer" style={{ display: "flex", gap: "8px" }}>
                    <button className="markdown-db-create-db-btn" onClick={() => handleCreateDbFile(plugin.settings.defaultDbFolder)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <Icon name="plus" />
                    </button>
                    <button className="markdown-db-create-db-btn" onClick={() => handleCreateFolder(plugin.settings.defaultDbFolder || "")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <Icon name="folder-plus" />
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
                            views={dbData.views ? Object.keys(dbData.views) : []}
                            currentView={currentView}
                            onSwitchView={handleSwitchView}
                            onAddView={handleAddView}
                            onRenameView={handleRenameView}
                            onDeleteView={handleDeleteView}
                            onReorderViews={handleReorderViews}
                            templates={templates}
                            onAddTemplate={handleAddTemplate}
                            onRemoveTemplate={handleRemoveTemplate}
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
                                component={component}
                                onOpenRecord={async (record, records, index, event) => {
                                    if (selectedFile) {
                                        if (event?.ctrlKey || event?.metaKey) {
                                            const leaf = app.workspace.getLeaf("tab");
                                            await leaf.openFile(selectedFile, {
                                                state: { mode: "source" },
                                                eState: { line: record.lineStart }
                                            });
                                            return;
                                        }
                                        // Always use modal as requested, ignoring db-open-mode
                                        const modal = new RecordModal(app, selectedFile, record, plugin.settings.properties, records, index);
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
                                onSelectionModeChange={(isSelectionMode, clearSelection) => {
                                    setIsTableSelectionMode(isSelectionMode);
                                    clearTableSelectionRef.current = clearSelection;
                                }}
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
