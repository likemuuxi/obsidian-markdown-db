import * as React from "react";
import { App, Notice } from "obsidian";
import { useState, useMemo } from "react";
import { DatabaseData, DatabaseRecord } from "../database/parser";
import { EditableCell } from "./EditableCell";
import { PropertyMenu } from "./PropertyMenu";

interface TableViewProps {
    app: App;
    data: DatabaseData;
    fileName?: string;
    sourcePath?: string;
    knownProperties: string[];
    knownValues: Record<string, string[]>;
    blockStyleProperties?: string[];
    onUpdateProperty: (record: DatabaseRecord, key: string, value: string) => void;
    onUpdateContent: (record: DatabaseRecord, newContent: string) => void;
    onRenameRecord: (record: DatabaseRecord, newName: string) => void;
    onOpenRecord: (record: DatabaseRecord) => void;
    onAddRecord: () => void;
    onAddProperty: (name: string) => void;
    onSaveToGlobal: (name: string) => void;
    onRemoveGlobalValue: (key: string, value: string) => void;
    onRowContextMenu: (record: DatabaseRecord, event: React.MouseEvent) => void;
    onHeaderContextMenu: (key: string, event: React.MouseEvent) => void;
    onUpdateConfig: (key: string, value: string) => void;
    onReorderRecord?: (fromIndex: number, toIndex: number) => void;
    portalContainer?: HTMLElement;
}

export const TableView: React.FC<TableViewProps> = ({ app, data, fileName, sourcePath, knownProperties, knownValues, blockStyleProperties, onUpdateProperty, onUpdateContent, onRenameRecord, onOpenRecord, onAddRecord, onAddProperty, onSaveToGlobal, onRemoveGlobalValue, onRowContextMenu, onHeaderContextMenu, onUpdateConfig, onReorderRecord, portalContainer }) => {
    
    const propertyKeys = useMemo(() => {
        const all = Array.from(data.allKeys);
        const order = data.config.columnOrder || [];
        
        // Keys present in order
        const ordered = order.filter(k => all.includes(k));
        // Keys not present in order
        const remaining = all.filter(k => !ordered.includes(k));
        
        return [...ordered, ...remaining];
    }, [data.allKeys, data.config.columnOrder]);

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
                        recordValue = vals ? vals.join(", ") : "";
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
                        valA = (a.properties[key] || []).join(", ");
                        valB = (b.properties[key] || []).join(", ");
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

    const columns = ["Name", ...propertyKeys, "Content"];
    const displayTitle = fileName || data.title;

    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

    const handleAddClick = (e: React.MouseEvent) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setMenuPosition({ x: rect.left, y: rect.bottom + 5 });
        setMenuOpen(true);
    };

    const handleDragStart = (e: React.DragEvent, key: string) => {
        e.dataTransfer.setData("text/plain", key);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
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

    const [dropTarget, setDropTarget] = useState<{index: number, position: 'top' | 'bottom'} | null>(null);
    const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
    const isManualSort = (!data.config.sort || data.config.sort.length === 0) && (!data.config.filters || data.config.filters.length === 0);

    const handleRowDragStart = (e: React.DragEvent, index: number) => {
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
        e.stopPropagation(); // Ensure we handle the dragover
        e.dataTransfer.dropEffect = "move";
        
        // Calculate position relative to row
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const position = e.clientY < midY ? 'top' : 'bottom';
        
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
        e.stopPropagation(); // Stop bubbling to prevent other handlers
        handleRowDragEnd();
        
        const data = e.dataTransfer.getData("text/plain");
        if (!data.startsWith("row-")) return;
        
        const sourceIndex = parseInt(data.replace("row-", ""));
        if (isNaN(sourceIndex)) return;
        
        // Recalculate position to avoid stale state
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const position = e.clientY < midY ? 'top' : 'bottom';
        
        let finalToIndex = targetIndex;
        if (position === 'bottom') {
            finalToIndex = targetIndex + 1;
        }
        
        // Correction for removing item from array before insertion if source < target
        if (sourceIndex < finalToIndex) {
            finalToIndex--;
        }
        
        if (sourceIndex === finalToIndex) return; // No move
        
        if (onReorderRecord) {
            onReorderRecord(sourceIndex, finalToIndex);
        }
    };

    return (
        <div className="markdown-db-table-container">
            <table className="markdown-db-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr>
                        <th style={{ width: "32px", padding: "8px 4px", borderBottom: "2px solid var(--background-modifier-border)" }}></th>
                        {columns.map(col => {
                            const isProperty = col !== "Name" && col !== "Content";
                            return (
                            <th key={col} 
                                draggable={isProperty}
                                onDragStart={(e) => isProperty && handleDragStart(e, col)}
                                onDragOver={(e) => isProperty && handleDragOver(e)}
                                onDrop={(e) => isProperty && handleDrop(e, col)}
                                style={{
                                    textAlign: "left",
                                    padding: "8px",
                                    borderBottom: "2px solid var(--background-modifier-border)",
                                    fontWeight: "600",
                                    color: "var(--text-muted)",
                                    fontSize: "12px",
                                    textTransform: "uppercase",
                                    cursor: isProperty ? "grab" : "default",
                                    userSelect: "none"
                                }}
                                onContextMenu={(e) => {
                                    if (isProperty) {
                                        onHeaderContextMenu(col, e);
                                    }
                                }}
                            >
                                {col}
                            </th>
                        )})}
                        <th style={{
                            width: "40px",
                            padding: "8px",
                            borderBottom: "2px solid var(--background-modifier-border)",
                            borderRight: "none",
                            textAlign: "center",
                            cursor: "pointer",
                            color: "var(--text-muted)"
                        }} onClick={handleAddClick} title="Add Property Column">
                            +
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {processedRecords.map((record, index) => (
                        <tr 
                            key={index} 
                            style={{
                                borderBottom: "1px solid var(--background-modifier-border)",
                                boxShadow: (dropTarget?.index === index && dropTarget.position === 'top') 
                                    ? "inset 0 2px 0 0 var(--interactive-accent)"
                                    : (dropTarget?.index === index && dropTarget.position === 'bottom')
                                        ? "inset 0 -2px 0 0 var(--interactive-accent)"
                                        : "none"
                            }} 
                            className="markdown-db-row" 
                            onContextMenu={(e) => onRowContextMenu(record, e)}
                            onMouseEnter={() => setHoveredRowIndex(index)}
                            onMouseLeave={() => setHoveredRowIndex(null)}
                            onDragOver={isManualSort ? (e) => handleRowDragOver(e, index) : undefined}
                            onDrop={isManualSort ? (e) => handleRowDrop(e, index) : undefined}
                            onDragEnd={handleRowDragEnd}
                        >
                            <td style={{ padding: "0", verticalAlign: "top", textAlign: "center" }}>
                                {isManualSort && (
                                    <div
                                        draggable
                                        onDragStart={(e) => handleRowDragStart(e, index)}
                                        className="markdown-db-drag-handle"
                                        style={{
                                            cursor: "grab",
                                            padding: "6px",
                                            marginTop: "4px",
                                            opacity: hoveredRowIndex === index ? 1 : 0,
                                            transition: "opacity 0.2s",
                                            color: "var(--text-muted)",
                                            display: "inline-block"
                                        }}
                                        title="Drag to reorder"
                                    >
                                        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                                             <path d="M4 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
                                        </svg>
                                    </div>
                                )}
                            </td>
                            <td style={{
                                padding: "0",
                                verticalAlign: "top",
                                color: "var(--text-strong)",
                                fontWeight: "500",
                                position: "relative"
                            }}>
                                <div style={{ position: "relative", width: "100%" }}>
                                    <EditableCell
                                        app={app}
                                        component={null}
                                        sourcePath={sourcePath || displayTitle}
                                        value={`[[${displayTitle}#${record.title}|${record.title}]]`}
                                        editValue={record.title}
                                        onSave={(newVal) => {
                                            onRenameRecord(record, newVal);
                                        }}
                                        onLinkClick={() => onOpenRecord(record)}
                                        portalContainer={portalContainer}
                                    />
                                </div>
                            </td>
                            {propertyKeys.map(key => (
                                <td key={key} style={{
                                    padding: "0",
                                    verticalAlign: "top",
                                    color: "var(--text-normal)",
                                    position: "relative"
                                }}>
                                    <EditableCell
                                        app={app}
                                        component={null}
                                        sourcePath={sourcePath || displayTitle}
                                        value={record.properties[key]?.join(", ") || ""}
                                        onSave={(newVal) => onUpdateProperty(record, key, newVal)}
                                        suggestions={knownValues?.[key] || []}
                                        isPropertyColumn={blockStyleProperties?.includes(key) ?? false}
                                        propertyKey={key}
                                        onRemoveGlobalValue={onRemoveGlobalValue}
                                        portalContainer={portalContainer}
                                    />
                                </td>
                            ))}
                            <td style={{
                                padding: "0",
                                verticalAlign: "top",
                                color: "var(--text-normal)",
                                position: "relative"
                            }}>
                                <EditableCell
                                    app={app}
                                    component={null}
                                    sourcePath={sourcePath || displayTitle}
                                    value={record.content?.trim() || ""}
                                    onSave={(newVal) => onUpdateContent(record, newVal)}
                                    isContentColumn={true}
                                    contentHeight={data.config.contentHeight}
                                    portalContainer={portalContainer}
                                />
                            </td>
                            {/* Empty cell for the add column button column */}
                            <td style={{ borderBottom: "1px solid var(--background-modifier-border)", borderRight: "none" }}></td>
                        </tr>
                    ))}
                    <tr 
                        className="markdown-db-new-row" 
                        onClick={onAddRecord}
                        style={{
                            borderBottom: "1px solid var(--background-modifier-border)"
                        }}
                    >
                        <td colSpan={columns.length + 2} style={{ padding: "8px 12px", color: "var(--text-muted)", cursor: "pointer", borderRight: "none" }}>
                            + New
                        </td>
                    </tr>
                </tbody>
            </table>
            {menuOpen && (
                <PropertyMenu
                    onClose={() => setMenuOpen(false)}
                    onSelect={(name) => {
                        onAddProperty(name);
                        setMenuOpen(false);
                    }}
                    position={menuPosition}
                    knownProperties={knownProperties}
                    existingProperties={Array.from(data.allKeys)}
                    onSaveToGlobal={onSaveToGlobal}
                    portalContainer={portalContainer}
                />
            )}
        </div>
    );
};
