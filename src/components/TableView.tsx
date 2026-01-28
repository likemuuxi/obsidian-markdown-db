import * as React from "react";
import { App, Notice, getIcon } from "obsidian";
import { useState, useMemo } from "react";
import { DatabaseData, DatabaseRecord, PropertyType, PROPERTY_TYPE_ICONS } from "../database/schema";
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
    onOpenRecord: (record: DatabaseRecord) => void;
    onAddRecord: () => void;
    onAddProperty: (name: string, type?: PropertyType) => void;
    onSaveToGlobal: (name: string, type?: PropertyType) => void;
    onRemoveGlobalValue: (key: string, value: string) => void;
    onRowContextMenu: (record: DatabaseRecord, event: React.MouseEvent) => void;
    onHeaderContextMenu: (key: string, event: React.MouseEvent) => void;
    onUpdateConfig: (key: string, value: string) => void;
    onReorderRecord?: (fromIndex: number, toIndex: number) => void;
    portalContainer?: HTMLElement;
}

export const TableView: React.FC<TableViewProps> = ({ app, data, fileName, sourcePath, globalProperties, onUpdateProperty, onUpdateContent, onRenameRecord, onOpenRecord, onAddRecord, onAddProperty, onSaveToGlobal, onRemoveGlobalValue, onRowContextMenu, onHeaderContextMenu, onUpdateConfig, onReorderRecord, portalContainer }) => {
    
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

    // Pagination state
    const [pageSize, setPageSize] = useState(25);
    const [currentPage, setCurrentPage] = useState(1);

    // Reset to page 1 when data changes (filters/sort)
    React.useEffect(() => {
        setCurrentPage(1);
    }, [processedRecords]);

    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return processedRecords.slice(start, end);
    }, [processedRecords, currentPage, pageSize]);

    const totalPages = Math.ceil(processedRecords.length / pageSize);

    const columns = ["Name", ...propertyKeys, ...(data.config.showContent !== false ? ["Content"] : [])];
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

    return (
        <div className="markdown-db-table-container">
            <table className="markdown-db-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr>
                        <th style={{ width: "32px", padding: "8px 4px", borderBottom: "2px solid var(--background-modifier-border)" }}></th>
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
                                    if (isProperty || col === "Name") {
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
                    {paginatedRecords.map((record, index) => (
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
                                        <span 
                                            style={{ display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}
                                            title="Drag to reorder"
                                            dangerouslySetInnerHTML={{ __html: dragHandleIcon }}
                                        />
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
                                        <EditableCell
                                            app={app}
                                            component={null}
                                            sourcePath={sourcePath || displayTitle}
                                            value={val?.map(v => String(v.value)).join(", ") || ""}
                                            onSave={(newVal) => onUpdateProperty(record, key, newVal, type)}
                                        suggestions={globalProperties.find(p => p.name === key)?.values || []}
                                        isPropertyColumn={type === "multi" || type === "select" || type === "boolean" || type === "date" || type === "number"}
                                        propertyKey={key}
                                            onRemoveGlobalValue={onRemoveGlobalValue}
                                            portalContainer={portalContainer}
                                            type={type}
                                        />
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
                                        component={null}
                                        sourcePath={sourcePath || displayTitle}
                                        value={record.content?.trim() || ""}
                                        onSave={(newVal) => onUpdateContent(record, newVal)}
                                        isContentColumn={true}
                                        contentHeight={data.config.contentHeight}
                                        portalContainer={portalContainer}
                                    />
                                </td>
                            )}
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
                        <td colSpan={columns.length + 2} style={{ padding: "0", color: "var(--text-muted)", cursor: "pointer", borderRight: "none" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px" }}>
                                <span style={{
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
                                        <span style={{ color: "var(--text-muted)" }}>
                                            {currentPage} / {totalPages || 1}
                                        </span>
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
