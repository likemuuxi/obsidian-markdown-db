import * as React from "react";
import { App, Notice, getIcon } from "obsidian";
import { useState, useMemo } from "react";
import { DatabaseData, DatabaseRecord, PropertyType, PROPERTY_TYPE_ICONS, SortRule } from "../database/schema";
import { PropertyConfig } from "../settings";
import { EditableCell } from "./EditableCell";
import { PropertyMenu } from "./PropertyMenu";

interface TableViewProps {
    app: App;
    data: DatabaseData;
    fileName?: string;
    sourcePath?: string;
    globalProperties: PropertyConfig[];
    onUpdateProperty: (record: DatabaseRecord, key: string, value: string, explicitType?: string) => void;
    onUpdateContent: (record: DatabaseRecord, newContent: string) => void;
    onRenameRecord: (record: DatabaseRecord, newName: string) => void;
    onOpenRecord: (record: DatabaseRecord, records: DatabaseRecord[], index: number, event?: React.MouseEvent) => void;
    onAddRecord: () => void;
    onAddChildRecord: (parentRecord: DatabaseRecord) => void;
    onMoveRecord: (sourceRecord: DatabaseRecord, targetRecord: DatabaseRecord, position: "before" | "after" | "child") => void;
    onAddProperty: (name: string, type?: PropertyType) => void;
    onSaveToGlobal: (name: string, type?: PropertyType) => void;
    onRemoveGlobalValue: (key: string, value: string) => void;
    onRowContextMenu: (record: DatabaseRecord, selectedRecords: DatabaseRecord[], event: React.MouseEvent) => void;
    onHeaderContextMenu: (key: string, event: React.MouseEvent) => void;
    onUpdateConfig: (key: string, value: string) => void;
    onSelectionModeChange?: (isSelectionMode: boolean, clearSelection: (() => void) | null) => void;
    onReorderRecord?: (fromIndex: number, toIndex: number) => void;
    portalContainer?: HTMLElement;
    component?: any;
    readonly?: boolean;
}

export const TableView: React.FC<TableViewProps> = ({ app, data, fileName, sourcePath, globalProperties, onUpdateProperty, onUpdateContent, onRenameRecord, onOpenRecord, onAddRecord, onAddChildRecord, onMoveRecord, onAddProperty, onSaveToGlobal, onRemoveGlobalValue, onRowContextMenu, onHeaderContextMenu, onUpdateConfig, onSelectionModeChange, onReorderRecord, portalContainer, component, readonly }) => {
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const selectionGestureRef = React.useRef<{ index: number; clientX: number; clientY: number } | null>(null);
    const getRecordSelectionKey = React.useCallback((record: DatabaseRecord) => {
        return `${record.lineStart}:${record.title}`;
    }, []);

    const toggleCollapse = React.useCallback((recordId: string) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(recordId)) {
                next.delete(recordId);
            } else {
                next.add(recordId);
            }
            return next;
        });
    }, []);

    const hasChildrenMap = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const record of data.records) {
            if (record.children && record.children.length > 0) {
                map.set(record.id, true);
            }
        }
        return map;
    }, [data.records]);

    const parentIdMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const record of data.records) {
            if (record.parentId) {
                map.set(record.id, record.parentId);
            }
        }
        return map;
    }, [data.records]);

    const propertyKeys = useMemo(() => {
        const all = Array.from(data.allKeys);
        const order = data.config.columnOrder;
        const hidden = data.config.hiddenColumns || [];

        let keys = all;

        if (order) {
            const ordered = order.filter(k => all.includes(k));
            const remaining = all.filter(k => !order.includes(k));
            keys = [...ordered, ...remaining];
        } else {
            keys = all;
        }

        return keys.filter(k => !hidden.includes(k));
    }, [data.allKeys, data.config.columnOrder, data.config.hiddenColumns]);

    const processedRecords = useMemo(() => {
        let records = [...data.records];

        // 1. Filter
        if (data.config.filters && data.config.filters.length > 0) {
            records = records.filter(record => {
                return data.config.filters!.every(filter => {
                    const { key, operator, value } = filter;

                    let recordValue = "";
                    if (key === "Name") {
                        recordValue = record.title;
                    } else if (key === "Content") {
                        recordValue = record.content || "";
                    } else {
                        const vals = record.properties[key];
                        recordValue = vals ? vals.map(v => String(v.value)).join(", ") : "";
                    }

                    const valLower = recordValue.toLowerCase();
                    const filterValLower = value.toLowerCase();

                    switch (operator) {
                        case "contains":
                            return valLower.includes(filterValLower);
                        case "not_contains":
                            return !valLower.includes(filterValLower);
                        case "is":
                            return valLower === filterValLower;
                        case "is_not":
                            return valLower !== filterValLower;
                        case "is_empty":
                            return !recordValue || recordValue.length === 0;
                        case "is_not_empty":
                            return recordValue && recordValue.length > 0;
                        default:
                            return true;
                    }
                });
            });
        }

        // 2. Sort
        if (data.config.sort && data.config.sort.length > 0) {
            records.sort((a, b) => {
                for (const sortRule of data.config.sort!) {
                    const { key, direction } = sortRule;

                    let valA = "";
                    let valB = "";

                    if (key === "Name") {
                        valA = a.title;
                        valB = b.title;
                    } else if (key === "Content") {
                        valA = a.content || "";
                        valB = b.content || "";
                    } else {
                        valA = (a.properties[key] || []).map(v => String(v.value)).join(", ");
                        valB = (b.properties[key] || []).map(v => String(v.value)).join(", ");
                    }

                    if (valA !== valB) {
                        const compare = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                        return direction === "asc" ? compare : -compare;
                    }
                }
                return 0;
            });
        }

        return records;
    }, [data.records, data.config.filters, data.config.sort]);

    const visibleRecords = useMemo(() => {
        const isAncestorCollapsed = (record: DatabaseRecord): boolean => {
            let currentId: string | null = record.parentId;
            while (currentId) {
                if (collapsedIds.has(currentId)) return true;
                const parentRecord = data.records.find(r => r.id === currentId);
                currentId = parentRecord?.parentId || null;
            }
            return false;
        };

        return processedRecords.filter(record => !isAncestorCollapsed(record));
    }, [processedRecords, collapsedIds, data.records]);

    // Pagination state
    const [pageSize, setPageSize] = useState(data.config.pageSize || 25);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInputValue, setPageInputValue] = useState("1");

    React.useEffect(() => {
        if (data.config.pageSize) {
            setPageSize(data.config.pageSize);
        }
    }, [data.config.pageSize]);

    const isAddingRow = React.useRef(false);

    // Sync input value when currentPage changes
    React.useEffect(() => {
        setPageInputValue(currentPage.toString());
    }, [currentPage]);

    // Reset to page 1 when filters or sort change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [JSON.stringify(data.config.filters), JSON.stringify(data.config.sort)]);

    // Adjust pagination when data length changes (Add/Remove)
    React.useEffect(() => {
        const newTotal = Math.ceil(visibleRecords.length / pageSize) || 1;

        if (isAddingRow.current) {
            setCurrentPage(newTotal);
            isAddingRow.current = false;
        } else if (currentPage > newTotal) {
            setCurrentPage(newTotal);
        }
    }, [visibleRecords.length, pageSize, currentPage]);

    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return visibleRecords.slice(start, end);
    }, [visibleRecords, currentPage, pageSize]);

    const totalPages = Math.ceil(visibleRecords.length / pageSize);

    const columns = ["Name", ...propertyKeys, ...(data.config.showContent !== false ? ["Content"] : [])];
    const displayTitle = fileName || data.title;

    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
    const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
    const [isSelectionDragging, setIsSelectionDragging] = useState(false);

    const handleAddClick = (e: React.MouseEvent) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setMenuPosition({ x: rect.left, y: rect.bottom + 5 });
        setMenuOpen(true);
    };

    const handleSortClick = React.useCallback((key: string) => {
        if (readonly) return;
        const currentSort = data.config.sort || [];
        const existing = currentSort.find(s => s.key === key);
        let newSort: SortRule[];

        if (!existing) {
            newSort = [{ key, direction: "asc" }];
        } else if (existing.direction === "asc") {
            newSort = [{ key, direction: "desc" }];
        } else {
            newSort = [];
        }

        onUpdateConfig("db-sort", JSON.stringify(newSort));
    }, [data.config.sort, onUpdateConfig, readonly]);

    const getSortDirection = React.useCallback((key: string): "asc" | "desc" | null => {
        if (!data.config.sort || data.config.sort.length === 0) return null;
        const rule = data.config.sort.find(s => s.key === key);
        return rule ? rule.direction : null;
    }, [data.config.sort]);

    const handleDragStart = (e: React.DragEvent, key: string) => {
        e.dataTransfer.setData("text/plain", key);
        e.dataTransfer.effectAllowed = "move";
        setDragOverColumn(null);
    };

    const handleDragOver = (e: React.DragEvent, key: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverColumn !== key) {
            setDragOverColumn(key);
        }
    };

    const handleDragEnd = () => {
        setDragOverColumn(null);
    };

    const handleDrop = (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
        setDragOverColumn(null);
        const sourceKey = e.dataTransfer.getData("text/plain");

        if (sourceKey === targetKey) return;
        if (!propertyKeys.includes(sourceKey) || !propertyKeys.includes(targetKey)) return;

        const newOrder = [...propertyKeys];
        const fromIndex = newOrder.indexOf(sourceKey);
        const toIndex = newOrder.indexOf(targetKey);

        if (fromIndex !== -1 && toIndex !== -1) {
            newOrder.splice(fromIndex, 1);
            newOrder.splice(toIndex, 0, sourceKey);

            // Save as [A, B, C]
            onUpdateConfig("db-columns", "[" + newOrder.join(", ") + "]");
        }
    };

    const [dropTarget, setDropTarget] = useState<{ index: number, position: 'top' | 'bottom' | 'middle' } | null>(null);
    const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
    const isManualSort = (!data.config.sort || data.config.sort.length === 0) && (!data.config.filters || data.config.filters.length === 0);
    const isSelectionMode = isSelectionDragging || selectedRowKeys.size > 0;
    const selectedRecords = useMemo(() => {
        return paginatedRecords.filter((record) => selectedRowKeys.has(getRecordSelectionKey(record)));
    }, [paginatedRecords, selectedRowKeys, getRecordSelectionKey]);

    React.useEffect(() => {
        setSelectedRowKeys((prev) => {
            const next = new Set<string>();
            paginatedRecords.forEach((record) => {
                const key = getRecordSelectionKey(record);
                if (prev.has(key)) {
                    next.add(key);
                }
            });

            if (next.size === prev.size) {
                let same = true;
                prev.forEach((key) => {
                    if (!next.has(key)) {
                        same = false;
                    }
                });
                if (same) {
                    return prev;
                }
            }

            return next;
        });
    }, [paginatedRecords, getRecordSelectionKey]);

    const updateSelectionRange = React.useCallback((fromIndex: number, toIndex: number) => {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        const next = new Set<string>();

        for (let i = start; i <= end; i++) {
            const record = paginatedRecords[i];
            if (record) {
                next.add(getRecordSelectionKey(record));
            }
        }

        setSelectedRowKeys(next);
    }, [paginatedRecords, getRecordSelectionKey]);

    React.useEffect(() => {
        const activateDistance = 6;

        const handlePointerMove = (event: PointerEvent) => {
            if (!selectionGestureRef.current || isSelectionDragging) return;

            const dx = event.clientX - selectionGestureRef.current.clientX;
            const dy = event.clientY - selectionGestureRef.current.clientY;
            const distance = Math.hypot(dx, dy);

            if (distance < activateDistance) return;

            setIsSelectionDragging(true);
            setSelectionAnchorIndex(selectionGestureRef.current.index);
            updateSelectionRange(selectionGestureRef.current.index, selectionGestureRef.current.index);
        };

        const handlePointerEnd = () => {
            selectionGestureRef.current = null;
            if (!isSelectionDragging) return;
            setIsSelectionDragging(false);
            setSelectionAnchorIndex(null);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerEnd);
        window.addEventListener("pointercancel", handlePointerEnd);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerEnd);
            window.removeEventListener("pointercancel", handlePointerEnd);
        };
    }, [isSelectionDragging, updateSelectionRange]);

    const handleSelectionGestureStart = React.useCallback((e: React.PointerEvent, index: number) => {
        if (readonly) return;
        if (e.button !== 0) return;
        if (!isSelectionMode && (e.target as HTMLElement).closest(".markdown-db-drag-handle")) return;
        if ((e.target as HTMLElement).closest("input, textarea, button, select, a, [contenteditable='true']")) return;

        selectionGestureRef.current = {
            index,
            clientX: e.clientX,
            clientY: e.clientY
        };
    }, [readonly, isSelectionMode]);

    const handleSelectionGestureEnter = React.useCallback((index: number) => {
        if (!isSelectionDragging || selectionAnchorIndex === null) return;
        updateSelectionRange(selectionAnchorIndex, index);
    }, [isSelectionDragging, selectionAnchorIndex, updateSelectionRange]);

    const toggleRowSelection = React.useCallback((record: DatabaseRecord) => {
        const key = getRecordSelectionKey(record);
        setSelectedRowKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, [getRecordSelectionKey]);

    const clearSelection = React.useCallback(() => {
        setSelectedRowKeys(new Set());
        setIsSelectionDragging(false);
        setSelectionAnchorIndex(null);
    }, []);

    React.useEffect(() => {
        onSelectionModeChange?.(isSelectionMode, isSelectionMode ? clearSelection : null);
    }, [isSelectionMode, clearSelection, onSelectionModeChange]);

    const selectAllVisibleRows = React.useCallback(() => {
        setSelectedRowKeys(new Set(paginatedRecords.map(getRecordSelectionKey)));
    }, [paginatedRecords, getRecordSelectionKey]);

    React.useEffect(() => {
        if (!isSelectionMode) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                clearSelection();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isSelectionMode, clearSelection]);

    const handleRowDragStart = (e: React.DragEvent, index: number) => {
        if (isSelectionMode) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData("text/plain", "row-" + index);
        e.dataTransfer.effectAllowed = "move";
        // e.stopPropagation(); // Don't stop propagation, let it bubble if needed
        // Add a global class to help with styling or event handling if needed
        document.body.classList.add("markdown-db-dragging-row");
    };

    const handleRowDragEnd = () => {
        setDropTarget(null);
        document.body.classList.remove("markdown-db-dragging-row");
    }

    const handleRowDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;

        let position: 'top' | 'bottom' | 'middle';
        if (relY < height * 0.25) {
            position = 'top';
        } else if (relY > height * 0.75) {
            position = 'bottom';
        } else {
            position = 'middle';
        }

        setDropTarget({ index, position });
    };

    const handleRowDragLeave = (e: React.DragEvent) => {
        // Only clear if we're leaving the table or something? 
        // Actually, dragging over another row will overwrite dropTarget.
        // Dragging out of the table might need clearing.
        // For now, let's just let it be.
    }

    const handleRowDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        handleRowDragEnd();

        const data = e.dataTransfer.getData("text/plain");
        if (!data.startsWith("row-")) return;

        const sourceIndex = parseInt(data.replace("row-", ""));
        if (isNaN(sourceIndex)) return;
        if (sourceIndex === targetIndex) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;

        let position: 'top' | 'bottom' | 'middle';
        if (relY < height * 0.25) {
            position = 'top';
        } else if (relY > height * 0.75) {
            position = 'bottom';
        } else {
            position = 'middle';
        }

        const sourceRecord = paginatedRecords[sourceIndex];
        const targetRecord = paginatedRecords[targetIndex];
        if (!sourceRecord || !targetRecord) return;

        if (position === 'middle') {
            onMoveRecord(sourceRecord, targetRecord, "child");
        } else {
            onMoveRecord(sourceRecord, targetRecord, position === 'top' ? "before" : "after");
        }
    };

    const allPropertyTypes = useMemo(() => {
        const types: Record<string, PropertyType> = {};

        // 0. Global defaults
        globalProperties.forEach(p => {
            types[p.name] = p.type;
        });

        // 1. Config
        if (data.config.columnTypes) {
            Object.assign(types, data.config.columnTypes);
        }
        // 2. Scan records for missing or text types
        data.records.forEach(record => {
            Object.entries(record.properties).forEach(([key, values]) => {
                if (values && values.length > 0) {
                    const valType = values[0].type;
                    // If type is not recorded or is text, and we found a more specific type
                    if ((!types[key] || types[key] === "text") && valType !== "text") {
                        types[key] = valType;
                    }
                    // If not recorded, record it (even if text)
                    if (!types[key]) {
                        types[key] = valType;
                    }
                }
            });
        });
        return types;
    }, [data]);

    const propertySuggestions = useMemo(() => {
        const map: Record<string, string[]> = {};

        const addValue = (key: string, rawValue: unknown) => {
            if (rawValue === null || rawValue === undefined) return;
            const str = String(rawValue).trim();
            if (!str) return;
            if (!map[key]) map[key] = [];
            map[key].push(str);
        };

        globalProperties.forEach((p) => {
            if (!map[p.name]) map[p.name] = [];
            p.values.forEach((val) => addValue(p.name, val));
        });

        data.records.forEach((record) => {
            Object.entries(record.properties).forEach(([key, values]) => {
                values.forEach((typed) => {
                    if (typed.type === "multi") {
                        if (Array.isArray(typed.value)) {
                            typed.value.forEach((val) => addValue(key, val));
                        } else {
                            String(typed.value)
                                .split(/[,，]/)
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .forEach((val) => addValue(key, val));
                        }
                    } else {
                        addValue(key, typed.value);
                    }
                });
            });
        });

        Object.keys(map).forEach((key) => {
            map[key] = Array.from(new Set(map[key]));
        });

        return map;
    }, [data.records, globalProperties]);

    const dragHandleIcon = useMemo(() => {
        const icon = getIcon("grip-vertical");
        if (icon) {
            icon.style.width = "14px";
            icon.style.height = "14px";
            return icon.outerHTML;
        }
        return "";
    }, []);

    const prevIcon = useMemo(() => {
        const icon = getIcon("chevron-left");
        if (icon) {
            icon.style.width = "14px";
            icon.style.height = "14px";
            return icon.outerHTML;
        }
        return "&lt;";
    }, []);

    const nextIcon = useMemo(() => {
        const icon = getIcon("chevron-right");
        if (icon) {
            icon.style.width = "14px";
            icon.style.height = "14px";
            return icon.outerHTML;
        }
        return "&gt;";
    }, []);

    const checkIcon = useMemo(() => {
        const icon = getIcon("check");
        if (icon) {
            icon.style.width = "12px";
            icon.style.height = "12px";
            return icon.outerHTML;
        }
        return "";
    }, []);

    return (
        <div className="markdown-db-table-container">
            <table className="markdown-db-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--background-primary)" }}>
                    <tr style={{ height: "42px" }}>
                        <th style={{ width: "40px", height: "42px", minHeight: "42px", padding: "8px 4px", borderBottom: "2px solid var(--background-modifier-border)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--background-primary)", textAlign: "center", boxSizing: "border-box", verticalAlign: "middle", lineHeight: 0 }}>
                            <div
                                style={{
                                    width: "26px",
                                    height: "26px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    margin: "0 auto",
                                    lineHeight: 0
                                }}
                            >
                                {!readonly && (
                                    <div
                                        onClick={(e) => {
                                            if (!isSelectionMode) return;
                                            e.stopPropagation();
                                            if (selectedRowKeys.size === paginatedRecords.length && paginatedRecords.length > 0) {
                                                clearSelection();
                                            } else {
                                                selectAllVisibleRows();
                                            }
                                        }}
                                        title={selectedRowKeys.size === paginatedRecords.length && paginatedRecords.length > 0 ? "Clear selection" : "Select all visible rows"}
                                        style={{
                                            width: "26px",
                                            height: "26px",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            cursor: isSelectionMode ? "pointer" : "default",
                                            visibility: isSelectionMode ? "visible" : "hidden",
                                            lineHeight: 0
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: "14px",
                                                height: "14px",
                                                border: "1px solid var(--background-modifier-border)",
                                                borderRadius: "3px",
                                                backgroundColor: selectedRowKeys.size === paginatedRecords.length && paginatedRecords.length > 0 ? "var(--interactive-accent)" : "var(--background-primary-alt)",
                                                color: "var(--text-on-accent)",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                boxSizing: "border-box",
                                                lineHeight: 0
                                            }}
                                            dangerouslySetInnerHTML={{ __html: selectedRowKeys.size === paginatedRecords.length && paginatedRecords.length > 0 ? checkIcon : "" }}
                                        />
                                    </div>
                                )}
                            </div>
                        </th>
                        {columns.map(col => {
                            const isProperty = col !== "Name" && col !== "Content";
                            let columnType = isProperty && data.config.columnTypes ? data.config.columnTypes[col] : undefined;

                            // Fallback: Infer from records if type is missing or "text" (to handle stale config)
                            if (isProperty && (!columnType || columnType === "text")) {
                                const recordWithVal = data.records.find(r => r.properties[col] && r.properties[col].length > 0 && r.properties[col][0].type !== "text");
                                if (recordWithVal) {
                                    columnType = recordWithVal.properties[col][0].type;
                                }
                            }

                            const iconName = columnType ? PROPERTY_TYPE_ICONS[columnType] : (isProperty ? "align-left" : (col === "Name" ? "uppercase-lowercase-a" : "text-quote"));
                            const iconSvg = getIcon(iconName);
                            if (iconSvg) {
                                iconSvg.style.width = "14px";
                                iconSvg.style.height = "14px";
                            }

                            return (
                                <th key={col}
                                    draggable={isProperty && !readonly}
                                    onDragStart={(e) => isProperty && !readonly && handleDragStart(e, col)}
                                    onDragOver={(e) => isProperty && !readonly && handleDragOver(e, col)}
                                    onDrop={(e) => isProperty && !readonly && handleDrop(e, col)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => handleSortClick(col)}
                                    title={`Click to sort by ${col}`}
                                    style={{
                                        textAlign: "left",
                                        height: "42px",
                                        minHeight: "42px",
                                        padding: "8px",
                                        borderBottom: "2px solid var(--background-modifier-border)",
                                        boxShadow: dragOverColumn === col ? "inset 3px 0 0 0 var(--interactive-accent)" : "none",
                                        transition: "box-shadow 0.1s, background-color 0.1s",
                                        fontWeight: "600",
                                        color: "var(--text-muted)",
                                        fontSize: "12px",
                                        position: "sticky",
                                        top: 0,
                                        zIndex: 10,
                                        backgroundColor: dragOverColumn === col ? "var(--background-modifier-hover)" : "var(--background-primary)",
                                        cursor: (isProperty && !readonly) ? "grab" : "pointer",
                                        userSelect: "none",
                                        boxSizing: "border-box",
                                        verticalAlign: "middle"
                                    }}
                                    onContextMenu={(e) => {
                                        if (!readonly && (isProperty || col === "Name")) {
                                            onHeaderContextMenu(col, e);
                                        }
                                    }}
                                >
                                    <span
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            marginRight: "6px",
                                            verticalAlign: "text-bottom",
                                            color: "var(--text-muted)",
                                            opacity: 0.8
                                        }}
                                        dangerouslySetInnerHTML={{ __html: iconSvg?.outerHTML || "" }}
                                    />
                                    {col}
                                    {(() => {
                                        const direction = getSortDirection(col);
                                        if (!direction) return null;
                                        const sortIcon = getIcon(direction === "asc" ? "chevron-up" : "chevron-down");
                                        if (sortIcon) {
                                            sortIcon.style.width = "12px";
                                            sortIcon.style.height = "12px";
                                        }
                                        return (
                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    marginLeft: "4px",
                                                    color: "var(--interactive-accent)",
                                                    verticalAlign: "text-bottom"
                                                }}
                                                dangerouslySetInnerHTML={{ __html: sortIcon?.outerHTML || "" }}
                                            />
                                        );
                                    })()}
                                </th>
                            )
                        })}
                        <th
                            className="markdown-db-add-column-header"
                            style={{
                                width: "40px",
                                height: "42px",
                                minHeight: "42px",
                                padding: "8px",
                                borderBottom: "2px solid var(--background-modifier-border)",
                                borderRight: "none",
                                textAlign: "center",
                                cursor: "pointer",
                                position: "sticky",
                                top: 0,
                                zIndex: 10,
                                backgroundColor: "var(--background-primary)",
                                color: "var(--text-muted)",
                                boxSizing: "border-box",
                                verticalAlign: "middle"
                            }} onClick={(e) => !readonly && handleAddClick(e)} title="Add Property Column">
                            +
                        </th>
                    </tr>
                </thead>
                    <tbody>
                    {paginatedRecords.map((record, index) => (
                        (() => {
                            const rowKey = getRecordSelectionKey(record);
                            const isSelected = selectedRowKeys.has(rowKey);
                            return (
                        <tr
                            key={rowKey}
                            style={{
                                borderBottom: "1px solid var(--background-modifier-border)",
                                backgroundColor: isSelected ? "color-mix(in srgb, var(--interactive-accent) 18%, var(--background-primary))" : (dropTarget?.index === index && dropTarget.position === 'middle') ? "color-mix(in srgb, var(--interactive-accent) 12%, var(--background-primary))" : "transparent",
                                boxShadow: (dropTarget?.index === index && dropTarget.position === 'top')
                                    ? "inset 0 2px 0 0 var(--interactive-accent)"
                                    : (dropTarget?.index === index && dropTarget.position === 'bottom')
                                        ? "inset 0 -2px 0 0 var(--interactive-accent)"
                                        : (dropTarget?.index === index && dropTarget.position === 'middle')
                                            ? "inset 0 0 0 2px var(--interactive-accent)"
                                            : "none"
                            }}
                            className={`markdown-db-row${isSelected ? " markdown-db-row-selected" : ""}${isSelectionMode ? " markdown-db-selection-mode" : ""}`}
                            onContextMenu={(e) => {
                                if (readonly) return;
                                const contextRecords = isSelected && selectedRecords.length > 0 ? selectedRecords : [record];
                                onRowContextMenu(record, contextRecords, e);
                            }}
                            onPointerDown={(e) => handleSelectionGestureStart(e, index)}
                            onPointerEnter={() => handleSelectionGestureEnter(index)}
                            onMouseEnter={() => setHoveredRowIndex(index)}
                            onMouseLeave={() => setHoveredRowIndex(null)}
                            onDragOver={(isManualSort && !readonly && !isSelectionMode) ? (e) => handleRowDragOver(e, index) : undefined}
                            onDrop={(isManualSort && !readonly && !isSelectionMode) ? (e) => handleRowDrop(e, index) : undefined}
                            onDragEnd={handleRowDragEnd}
                        >
                            <td
                                style={{ padding: "0", verticalAlign: "top", textAlign: "center", userSelect: "none", width: "40px" }}
                            >
                                <div
                                    style={{
                                        width: "26px",
                                        height: "26px",
                                        margin: "4px auto",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center"
                                    }}
                                >
                                    {!readonly && (
                                        isSelectionMode ? (
                                            <label
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleRowSelection(record);
                                                }}
                                                style={{
                                                    cursor: "pointer",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    width: "14px",
                                                    height: "14px"
                                                }}
                                                title={isSelected ? "Deselect row" : "Select row"}
                                            >
                                                <input
                                                    type="hidden"
                                                    style={{
                                                        display: "none"
                                                    }}
                                                />
                                                <span
                                                    style={{
                                                        width: "14px",
                                                        height: "14px",
                                                        border: "1px solid var(--background-modifier-border)",
                                                        borderRadius: "3px",
                                                        backgroundColor: isSelected ? "var(--interactive-accent)" : "var(--background-primary-alt)",
                                                        color: "var(--text-on-accent)",
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        boxSizing: "border-box"
                                                    }}
                                                    dangerouslySetInnerHTML={{ __html: isSelected ? checkIcon : "" }}
                                                />
                                            </label>
                                        ) : (
                                            isManualSort && (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => handleRowDragStart(e, index)}
                                                    className="markdown-db-drag-handle"
                                                    style={{
                                                        cursor: "grab",
                                                        padding: "6px",
                                                        opacity: hoveredRowIndex === index ? 1 : 0,
                                                        transition: "opacity 0.2s",
                                                        color: "var(--text-muted)",
                                                        display: "inline-block",
                                                        lineHeight: 0,
                                                        touchAction: "none"
                                                    }}
                                                    title="Drag to reorder. Drop on center of a row to make it a child."
                                                >
                                                    <span
                                                        style={{ display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}
                                                        title="Drag to reorder. Drop on center of a row to make it a child."
                                                        dangerouslySetInnerHTML={{ __html: dragHandleIcon }}
                                                    />
                                                </div>
                                            )
                                        )
                                    )}
                                </div>
                            </td>
                            <td style={{
                                padding: "0",
                                verticalAlign: "top",
                                color: "var(--text-strong)",
                                fontWeight: "500",
                                position: "relative"
                            }}
                                onMouseEnter={() => setHoveredRowIndex(index)}
                                onMouseLeave={() => setHoveredRowIndex(null)}
                            >
                                <div
                                    draggable={isManualSort && !readonly && !isSelectionMode}
                                    onDragStart={(isManualSort && !readonly && !isSelectionMode) ? (e) => handleRowDragStart(e, index) : undefined}
                                    onDragEnd={handleRowDragEnd}
                                    style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", paddingLeft: `${(record.level - 1) * 20}px`, cursor: (isManualSort && !readonly && !isSelectionMode) ? "grab" : "default" }}
                                >
                                    {hasChildrenMap.has(record.id) && (
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCollapse(record.id);
                                            }}
                                            style={{
                                                cursor: "pointer",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                width: "18px",
                                                height: "18px",
                                                marginRight: "2px",
                                                flexShrink: 0,
                                                transition: "transform 0.15s ease",
                                                transform: collapsedIds.has(record.id) ? "rotate(-90deg)" : "rotate(0deg)"
                                            }}
                                            dangerouslySetInnerHTML={{ __html: getIcon("chevron-down")?.outerHTML || "" }}
                                        />
                                    )}
                                    {!hasChildrenMap.has(record.id) && record.level > 1 && (
                                        <div style={{ width: "20px", flexShrink: 0 }} />
                                    )}
                                    <EditableCell
                                        app={app}
                                        component={component || null}
                                        sourcePath={sourcePath || displayTitle}
                                        value={`[[${displayTitle}#${record.title}|${record.title}]]`}
                                        editValue={record.title}
                                        onSave={(newVal) => {
                                            onRenameRecord(record, newVal);
                                        }}
                                        onLinkClick={(event) => onOpenRecord(record, processedRecords, (currentPage - 1) * pageSize + index, event)}
                                        portalContainer={portalContainer}
                                        readonly={readonly}
                                    />
                                </div>
                            </td>
                            {propertyKeys.map(key => {
                                const val = record.properties[key];
                                // Derive type using the unified allPropertyTypes logic
                                const type = allPropertyTypes[key] || "text";

                                return (
                                    <td key={key} style={{
                                        padding: "0",
                                        verticalAlign: type === "boolean" ? "middle" : "top",
                                        color: "var(--text-normal)",
                                        position: "relative"
                                    }}>
                                        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: type === "boolean" ? "center" : "flex-start" }}>
                                            <EditableCell
                                                app={app}
                                                component={component || null}
                                                sourcePath={sourcePath || displayTitle}
                                                value={val?.map(v => String(v.value)).join(", ") || ""}
                                                onSave={(newVal) => onUpdateProperty(record, key, newVal, type)}
                                                suggestions={propertySuggestions[key] || []}
                                                isPropertyColumn={type === "multi" || type === "select" || type === "boolean" || type === "date" || type === "number"}
                                                propertyKey={key}
                                                onRemoveGlobalValue={onRemoveGlobalValue}
                                                portalContainer={portalContainer}
                                                type={type}
                                                readonly={readonly}
                                            />
                                        </div>
                                    </td>
                                );
                            })}
                            {data.config.showContent !== false && (
                                <td style={{
                                    padding: "0",
                                    verticalAlign: "top",
                                    color: "var(--text-normal)",
                                    position: "relative"
                                }}>
                                    <EditableCell
                                        app={app}
                                        component={component || null}
                                        sourcePath={sourcePath || displayTitle}
                                        value={record.content?.trim() || ""}
                                        onSave={(newVal) => onUpdateContent(record, newVal)}
                                        isContentColumn={true}
                                        contentHeight={data.config.contentHeight}
                                        portalContainer={portalContainer}
                                        readonly={readonly}
                                    />
                                </td>
                            )}
                            {/* Empty cell for the add column button column */}
                            <td className="markdown-db-add-column-cell" style={{ borderBottom: "1px solid var(--background-modifier-border)", borderRight: "none" }}></td>
                        </tr>
                            );
                        })()
                    ))}
                    <tr
                        className="markdown-db-new-row"
                        onClick={() => {
                            if (readonly) return;
                            isAddingRow.current = true;
                            onAddRecord();
                        }}
                    >
                        <td colSpan={columns.length + 2} style={{
                            padding: "0",
                            color: "var(--text-muted)",
                            cursor: readonly ? "default" : "pointer",
                            borderRight: "none",
                            borderBottom: "1px solid var(--background-modifier-border)",
                            position: "sticky",
                            bottom: 0,
                            zIndex: 10,
                            backgroundColor: "var(--background-primary)",
                            boxShadow: "0 -1px 0 var(--background-modifier-border)"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px" }}>
                                <span className="markdown-db-add-record-button" style={{
                                    position: "sticky",
                                    background: "none",
                                    left: "0px",
                                    paddingRight: "8px"
                                }}>+ New</span>
                                {totalPages > 1 && (
                                    <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            position: "sticky",
                                            right: "0px",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            paddingLeft: "8px",
                                            fontSize: "12px"
                                        }}
                                    >
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            style={{
                                                background: "none",
                                                border: "none",
                                                padding: "2px 6px",
                                                cursor: currentPage === 1 ? "default" : "pointer",
                                                opacity: currentPage === 1 ? 0.3 : 0.7,
                                                color: "var(--text-normal)",
                                                display: "flex",
                                                alignItems: "center"
                                            }}
                                            dangerouslySetInnerHTML={{ __html: prevIcon }}
                                        />
                                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                            <input
                                                type="text"
                                                value={pageInputValue}
                                                onChange={(e) => setPageInputValue(e.target.value)}
                                                onBlur={() => setPageInputValue(currentPage.toString())}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        let p = parseInt(pageInputValue);
                                                        if (isNaN(p)) p = 1;
                                                        if (p < 1) p = 1;
                                                        if (p > totalPages) p = totalPages;
                                                        setCurrentPage(p);
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{
                                                    width: "30px",
                                                    textAlign: "center",
                                                    background: "var(--background-primary)",
                                                    border: "1px solid var(--background-modifier-border)",
                                                    borderRadius: "4px",
                                                    color: "var(--text-normal)",
                                                    padding: "0 2px",
                                                    fontSize: "12px",
                                                    height: "20px"
                                                }}
                                            />
                                            <span style={{ color: "var(--text-muted)" }}>
                                                / {totalPages || 1}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages || totalPages === 0}
                                            style={{
                                                background: "none",
                                                border: "none",
                                                padding: "2px 6px",
                                                cursor: currentPage === totalPages || totalPages === 0 ? "default" : "pointer",
                                                opacity: currentPage === totalPages || totalPages === 0 ? 0.3 : 0.7,
                                                color: "var(--text-normal)",
                                                display: "flex",
                                                alignItems: "center"
                                            }}
                                            dangerouslySetInnerHTML={{ __html: nextIcon }}
                                        />
                                    </div>
                                )}
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
            {menuOpen && (
                <PropertyMenu
                    onClose={() => setMenuOpen(false)}
                    onSelect={(name, type) => {
                        onAddProperty(name, type);
                        setMenuOpen(false);
                    }}
                    position={menuPosition}
                    globalProperties={globalProperties}
                    existingProperties={Array.from(data.allKeys)}
                    onSaveToGlobal={onSaveToGlobal}
                    portalContainer={portalContainer}
                    propertyTypes={allPropertyTypes}
                />
            )}
        </div>
    );
};
