import * as React from "react";
import { useState, useRef, useEffect } from "react";
import * as ReactDOM from "react-dom";
import { setIcon, Menu } from "obsidian";
import { DatabaseConfig, SortRule, FilterRule } from "../database/schema";

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

// Remove duplicate interface definition


interface ViewConfigPopupProps {
    onSave: (name: string, config: { openMode: string, showContent: boolean, contentHeight: string, filters: FilterRule[], sorts: SortRule[] }) => void;
    onDelete?: () => void;
    onClose: () => void;
    position: { top: number, left: number };
    portalContainer?: HTMLElement;
    menuRef: React.RefObject<HTMLDivElement>;
    allProperties: string[];
    initialName?: string;
    initialConfig?: DatabaseConfig;
    isEditing?: boolean;
}

const ViewConfigPopup = ({
    onSave,
    onDelete,
    onClose,
    position,
    portalContainer,
    menuRef,
    allProperties,
    initialName = "",
    initialConfig,
    isEditing = false
}: ViewConfigPopupProps) => {
    const [name, setName] = useState(initialName);
    const [openMode, setOpenMode] = useState(initialConfig?.openMode || "modal");
    const [showContent, setShowContent] = useState(initialConfig?.showContent !== false);
    const [contentHeight, setContentHeight] = useState(initialConfig?.contentHeight || "compact");
    const [filters, setFilters] = useState<FilterRule[]>(initialConfig?.filters || []);
    const [sorts, setSorts] = useState<SortRule[]>(initialConfig?.sort || []);

    // UI toggle states
    const [showFilters, setShowFilters] = useState(true);
    const [showSorts, setShowSorts] = useState(true);

    const handleAddFilter = () => {
        setFilters([...filters, { key: allProperties[0] || "Name", operator: "contains", value: "" }]);
        setShowFilters(true);
    };

    const handleRemoveFilter = (index: number) => {
        setFilters(filters.filter((_, i) => i !== index));
    };

    const handleUpdateFilter = (index: number, field: keyof FilterRule, value: any) => {
        const newFilters = [...filters];
        newFilters[index] = { ...newFilters[index], [field]: value };
        setFilters(newFilters);
    };

    const handleAddSort = () => {
        setSorts([...sorts, { key: allProperties[0] || "Name", direction: "asc" }]);
        setShowSorts(true);
    };

    const handleRemoveSort = (index: number) => {
        setSorts(sorts.filter((_, i) => i !== index));
    };

    const handleUpdateSort = (index: number, field: keyof SortRule, value: any) => {
        const newSorts = [...sorts];
        newSorts[index] = { ...newSorts[index], [field]: value };
        setSorts(newSorts);
    };

    return ReactDOM.createPortal(
        <div
            className="markdown-db-menu"
            ref={menuRef}
            onMouseDown={(e) => e.nativeEvent.stopImmediatePropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
                top: position.top,
                left: position.left,
                width: "320px",
                maxHeight: "80vh",
                overflowY: "auto",
                zIndex: 9999
            }}
        >
            <div className="markdown-db-menu-header">{isEditing ? "Edit View" : "Add New View"}</div>
            <div className="markdown-db-menu-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <input
                    type="text"
                    className="markdown-db-menu-input"
                    placeholder="View Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && name.trim()) {
                            onSave(name, { openMode, showContent, contentHeight, filters, sorts });
                            onClose();
                        }
                    }}
                />

                <div className="markdown-db-menu-row" style={{ marginTop: 8 }}>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)", flex: 1 }}>Open Mode</span>
                    <select
                        className="markdown-db-menu-select"
                        value={openMode}
                        onChange={(e) => setOpenMode(e.target.value as "split" | "tab" | "modal")}
                        style={{ width: "120px", flex: "none" }}
                    >
                        <option value="modal">Modal</option>
                        <option value="split">Split Pane</option>
                        <option value="tab">Current Tab</option>
                    </select>
                </div>

                <div className="markdown-db-menu-row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowContent(!showContent)}>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Show Content</span>
                    <div className={`checkbox-container ${showContent ? "is-enabled" : ""}`}>
                        <input type="checkbox" tabIndex={0} />
                    </div>
                </div>

                {showContent && (
                    <div className="markdown-db-menu-row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setContentHeight(contentHeight === "adaptive" ? "compact" : "adaptive")}>
                        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Adaptive Height</span>
                        <div className={`checkbox-container ${contentHeight === "adaptive" ? "is-enabled" : ""}`}>
                            <input type="checkbox" tabIndex={0} />
                        </div>
                    </div>
                )}

                {/* Filters Section */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--background-modifier-border)" }}>
                    <div className="markdown-db-menu-row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowFilters(!showFilters)}>
                        <span style={{ fontSize: "13px", fontWeight: "bold" }}>Filters ({filters.length})</span>
                        <Icon name={showFilters ? "chevron-down" : "chevron-right"} />
                    </div>
                    {showFilters && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                            {filters.map((filter, index) => (
                                <div key={index} className="markdown-db-menu-row" style={{ gap: 4 }}>
                                    <select
                                        className="markdown-db-menu-select"
                                        style={{ width: "80px" }}
                                        value={filter.key}
                                        onChange={(e) => handleUpdateFilter(index, "key", e.target.value)}
                                    >
                                        {["Name", "Content", ...allProperties].map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="markdown-db-menu-select"
                                        style={{ width: "80px" }}
                                        value={filter.operator}
                                        onChange={(e) => handleUpdateFilter(index, "operator", e.target.value)}
                                    >
                                        <option value="contains">contains</option>
                                        <option value="not_contains">not contains</option>
                                        <option value="is">is</option>
                                        <option value="is_not">is not</option>
                                        <option value="is_empty">empty</option>
                                        <option value="is_not_empty">not empty</option>
                                    </select>
                                    {filter.operator !== "is_empty" && filter.operator !== "is_not_empty" && (
                                        <input
                                            className="markdown-db-menu-input"
                                            style={{ width: "60px", minWidth: 0 }}
                                            value={filter.value}
                                            onChange={(e) => handleUpdateFilter(index, "value", e.target.value)}
                                            placeholder="Val"
                                        />
                                    )}
                                    <div
                                        style={{ cursor: "pointer", padding: "2px" }}
                                        onClick={() => handleRemoveFilter(index)}
                                    >
                                        <Icon name="x" />
                                    </div>
                                </div>
                            ))}
                            <button className="markdown-db-menu-add-btn" onClick={handleAddFilter} style={{ fontSize: "11px", padding: "2px 6px" }}>
                                + Add Filter
                            </button>
                        </div>
                    )}
                </div>

                {/* Sorts Section */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--background-modifier-border)" }}>
                    <div className="markdown-db-menu-row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowSorts(!showSorts)}>
                        <span style={{ fontSize: "13px", fontWeight: "bold" }}>Sorts ({sorts.length})</span>
                        <Icon name={showSorts ? "chevron-down" : "chevron-right"} />
                    </div>
                    {showSorts && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                            {sorts.map((sort, index) => (
                                <div key={index} className="markdown-db-menu-row" style={{ gap: 4 }}>
                                    <select
                                        className="markdown-db-menu-select"
                                        style={{ width: "120px" }}
                                        value={sort.key}
                                        onChange={(e) => handleUpdateSort(index, "key", e.target.value)}
                                    >
                                        {["Name", "Content", ...allProperties].map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="markdown-db-menu-select"
                                        style={{ width: "100px" }}
                                        value={sort.direction}
                                        onChange={(e) => handleUpdateSort(index, "direction", e.target.value)}
                                    >
                                        <option value="asc">Ascending</option>
                                        <option value="desc">Descending</option>
                                    </select>
                                    <div
                                        style={{ cursor: "pointer", padding: "2px" }}
                                        onClick={() => handleRemoveSort(index)}
                                    >
                                        <Icon name="x" />
                                    </div>
                                </div>
                            ))}
                            <button className="markdown-db-menu-add-btn" onClick={handleAddSort} style={{ fontSize: "11px", padding: "2px 6px" }}>
                                + Add Sort
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                    <button
                        className="markdown-db-menu-add-btn"
                        style={{ width: "100%", textAlign: "center", background: "var(--interactive-accent)", color: "var(--text-on-accent)" }}
                        onClick={() => {
                            if (name.trim()) {
                                onSave(name, { openMode, showContent, contentHeight, filters, sorts });
                                onClose();
                            }
                        }}
                    >
                        {isEditing ? "Save" : "Add View"}
                    </button>
                    {isEditing && onDelete && (
                        <button
                            className="markdown-db-menu-add-btn"
                            style={{ width: "100%", textAlign: "center", background: "var(--background-modifier-error)", color: "var(--text-on-accent)" }}
                            onClick={() => {
                                onDelete();
                                onClose();
                            }}
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </div>,
        portalContainer || document.body
    );
};

interface ToolbarProps {
    title: string;
    config: DatabaseConfig;
    onSearch: (term: string) => void;
    onUpdateConfig: (key: string, value: string) => Promise<void> | void;
    onUpdateTitle: (newTitle: string) => Promise<void> | void;
    allProperties: string[];
    portalContainer?: HTMLElement;
    views: string[];
    currentView: string | null;
    onSwitchView: (name: string | null) => void;
    onAddView: (name: string, config: { openMode: string, showContent: boolean, contentHeight: string, filters: FilterRule[], sorts: SortRule[] }) => Promise<void> | void;
    onRenameView?: (oldName: string, newName: string) => Promise<void> | void;
    onDeleteView?: (name: string) => Promise<void> | void;
    onReorderViews?: (names: string[]) => Promise<void> | void;
    viewsConfig?: Record<string, DatabaseConfig>;
    onUpdateViewConfig?: (viewName: string, key: string, value: string) => Promise<void> | void;
    templates?: string[];
    onAddTemplate?: () => void;
    onRemoveTemplate?: (path: string) => void;
    onAddRecord: (templatePath?: string) => Promise<void> | void;
}

const BufferedInput = ({
    value,
    onChange,
    placeholder,
    className,
    autoFocus
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
}) => {
    const [localValue, setLocalValue] = useState(value);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setLocalValue(value);
        }
    }, [value, isFocused]);

    const commit = () => {
        if (localValue !== value) {
            onChange(localValue);
        }
        setIsFocused(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
            setLocalValue(value);
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <input
            className={className}
            value={localValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            placeholder={placeholder}
            onFocus={() => setIsFocused(true)}
            autoFocus={autoFocus}
        />
    );
};

export const Toolbar: React.FC<ToolbarProps> = ({
    title,
    config,
    onSearch,
    onUpdateConfig,
    onAddRecord,
    onUpdateTitle,
    allProperties,
    portalContainer,
    views,
    currentView,
    onSwitchView,
    onAddView,
    onRenameView,
    onDeleteView,
    onReorderViews,
    viewsConfig,
    onUpdateViewConfig,
    templates,
    onAddTemplate,
    onRemoveTemplate
}) => {
    const [showConfig, setShowConfig] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [showSort, setShowSort] = useState(false);
    const [showAddView, setShowAddView] = useState(false);
    const [configPosition, setConfigPosition] = useState({ top: 0, right: 0 });
    const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 });
    const [sortPosition, setSortPosition] = useState({ top: 0, left: 0 });
    const [addViewPosition, setAddViewPosition] = useState({ top: 0, left: 0 });

    const configRef = useRef<HTMLDivElement>(null);
    const configMenuRef = useRef<HTMLDivElement>(null);
    const filterRef = useRef<HTMLButtonElement>(null);
    const filterMenuRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLButtonElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const addViewRef = useRef<HTMLDivElement>(null);
    const addViewMenuRef = useRef<HTMLDivElement>(null);

    const searchRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const [editingView, setEditingView] = useState<string | null>(null);
    const [editViewPosition, setEditViewPosition] = useState({ top: 0, left: 0 });
    const editViewMenuRef = useRef<HTMLDivElement>(null);

    const [draggedView, setDraggedView] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    const handleViewContextMenu = (e: React.MouseEvent, viewName: string) => {
        e.preventDefault();

        if (viewName === "All") return; // Cannot edit "All" view

        // Check if we have config for this view
        const hasConfig = viewName === currentView || (viewsConfig && viewsConfig[viewName]);
        if (!hasConfig) return;

        setEditingView(viewName);
        setEditViewPosition({
            top: e.clientY,
            left: e.clientX
        });
        setShowConfig(false);
        setShowFilter(false);
        setShowSort(false);
        setShowAddView(false);
    };

    const handleDragStart = (e: React.DragEvent, viewName: string) => {
        setDraggedView(viewName);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, targetView: string) => {
        e.preventDefault();
        if (draggedView === targetView) return;
        e.dataTransfer.dropEffect = "move";
        setDropTarget(targetView);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // Optional: clear drop target if leaving the container or specific items
        // But simply clearing on drop/end is usually enough for this list
    };

    const handleDragEnd = () => {
        setDraggedView(null);
        setDropTarget(null);
    };

    const handleDrop = (e: React.DragEvent, targetView: string) => {
        e.preventDefault();
        setDropTarget(null);
        if (!draggedView || draggedView === targetView) return;

        // Calculate new order
        const currentViews = views || [];
        const fromIndex = currentViews.indexOf(draggedView);
        const toIndex = currentViews.indexOf(targetView);

        if (fromIndex !== -1 && toIndex !== -1) {
            const newViews = [...currentViews];
            newViews.splice(fromIndex, 1);
            newViews.splice(toIndex, 0, draggedView);

            if (onReorderViews) {
                onReorderViews(newViews);
            }
        }
        setDraggedView(null);
    };

    // Click outside to close config menu or search
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showConfig && configRef.current && !configRef.current.contains(event.target as Node)) {
                if (configMenuRef.current && configMenuRef.current.contains(event.target as Node)) {
                    return;
                }
                setShowConfig(false);
            }
            if (showFilter && filterRef.current && !filterRef.current.contains(event.target as Node)) {
                if (filterMenuRef.current && filterMenuRef.current.contains(event.target as Node)) {
                    return;
                }
                setShowFilter(false);
            }
            if (showSort && sortRef.current && !sortRef.current.contains(event.target as Node)) {
                if (sortMenuRef.current && sortMenuRef.current.contains(event.target as Node)) {
                    return;
                }
                setShowSort(false);
            }
            if (showAddView && addViewRef.current && !addViewRef.current.contains(event.target as Node)) {
                if (addViewMenuRef.current && addViewMenuRef.current.contains(event.target as Node)) {
                    return;
                }
                setShowAddView(false);
            }
            if (editingView && editViewMenuRef.current && !editViewMenuRef.current.contains(event.target as Node)) {
                setEditingView(null);
            }
            if (showSearch && searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                if (searchRef.current && searchRef.current.value === "") {
                    setShowSearch(false);
                }
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showSearch, showConfig, showFilter, showSort, showAddView, editingView]);

    useEffect(() => {
        if (showSearch && searchRef.current) {
            searchRef.current.focus();
        }
    }, [showSearch]);

    const handleConfigClick = () => {
        if (!showConfig && configRef.current) {
            const rect = configRef.current.getBoundingClientRect();
            setConfigPosition({
                top: rect.bottom + 4,
                right: window.innerWidth - rect.right
            });
        }
        setShowConfig(!showConfig);
        setShowFilter(false);
        setShowSort(false);
        setShowAddView(false);
    };

    const handleFilterClick = () => {
        if (!showFilter && filterRef.current) {
            const rect = filterRef.current.getBoundingClientRect();
            setFilterPosition({
                top: rect.bottom + 4,
                left: rect.left
            });
        }
        setShowFilter(!showFilter);
        setShowConfig(false);
        setShowSort(false);
        setShowAddView(false);
    };

    const handleSortClick = () => {
        if (!showSort && sortRef.current) {
            const rect = sortRef.current.getBoundingClientRect();
            setSortPosition({
                top: rect.bottom + 4,
                left: rect.left
            });
        }
        setShowSort(!showSort);
        setShowConfig(false);
        setShowFilter(false);
        setShowAddView(false);
    };

    const handleAddViewClick = () => {
        if (!showAddView && addViewRef.current) {
            const rect = addViewRef.current.getBoundingClientRect();
            setAddViewPosition({
                top: rect.bottom + 4,
                left: rect.left
            });
        }
        setShowAddView(!showAddView);
        setShowConfig(false);
        setShowFilter(false);
        setShowSort(false);
    };

    const handleUpdateFilter = (newFilters: FilterRule[]) => {
        // Serialize to JSON string for storage
        onUpdateConfig("db-filter", JSON.stringify(newFilters));
    };

    const handleUpdateSort = (newSort: SortRule[]) => {
        // Serialize to JSON string for storage
        onUpdateConfig("db-sort", JSON.stringify(newSort));
    };

    return (
        <div className="markdown-db-header">
            <div className="markdown-db-header-title-row">
                <BufferedInput
                    className="markdown-db-title-input-large"
                    value={title ? title.split("(")[0].trim() : ""}
                    onChange={(val) => {
                        console.log("Toolbar: BufferedInput changed to:", val);
                        onUpdateTitle(val);
                    }}
                    placeholder="Untitled Database"
                />
            </div>
            <div className="markdown-db-toolbar">
                <div className="markdown-db-toolbar-left">
                    <div className="markdown-db-view-switcher">
                        <div
                            className={`markdown-db-view-tab ${!currentView ? "active" : ""}`}
                            onClick={() => onSwitchView && onSwitchView(null)}
                        >
                            <Icon name="table" className="markdown-db-view-icon" />
                            <span style={{ marginLeft: 6 }}>All</span>
                        </div>
                        {views && views.map((view, index) => {
                            let style: React.CSSProperties = {};
                            if (dropTarget === view && draggedView) {
                                const draggedIndex = views.indexOf(draggedView);
                                if (draggedIndex < index) {
                                    style.borderRight = "2px solid var(--interactive-accent)";
                                    style.borderRadius = "0";
                                } else {
                                    style.borderLeft = "2px solid var(--interactive-accent)";
                                    style.borderRadius = "0";
                                }
                            }
                            return (
                                <div
                                    key={view}
                                    className={`markdown-db-view-tab ${currentView === view ? "active" : ""}`}
                                    style={style}
                                    onClick={() => onSwitchView && onSwitchView(view)}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, view)}
                                    onDragOver={(e) => handleDragOver(e, view)}
                                    onDragEnd={handleDragEnd}
                                    onDrop={(e) => handleDrop(e, view)}
                                    onContextMenu={(e) => handleViewContextMenu(e, view)}
                                >
                                    <Icon name="table" className="markdown-db-view-icon" />
                                    <span style={{ marginLeft: 6 }}>{view}</span>
                                </div>
                            );
                        })}
                        <div className="markdown-db-view-separator"></div>
                        {onAddView && (
                            <div
                                ref={addViewRef}
                                className={`markdown-db-view-add ${showAddView ? "active" : ""}`}
                                title="Add view"
                                onClick={handleAddViewClick}
                            >
                                <Icon name="plus" className="markdown-db-view-icon" />
                                {showAddView && (
                                    <ViewConfigPopup
                                        onSave={onAddView}
                                        onClose={() => setShowAddView(false)}
                                        position={addViewPosition}
                                        portalContainer={portalContainer}
                                        menuRef={addViewMenuRef}
                                        allProperties={allProperties}
                                        initialConfig={config}
                                    />
                                )}
                            </div>
                        )}
                        {editingView && (
                            <ViewConfigPopup
                                isEditing={true}
                                initialName={editingView}
                                initialConfig={editingView === currentView ? config : (viewsConfig?.[editingView] || config)}
                                onSave={async (name, newConfig) => {
                                    if (onRenameView && name !== editingView) {
                                        await onRenameView(editingView, name);
                                    }

                                    const targetName = name;
                                    const originalConfig = editingView === currentView ? config : (viewsConfig?.[editingView] || config);

                                    const updateFn = (key: string, value: string) => {
                                        if (editingView === currentView && targetName === editingView) {
                                            onUpdateConfig(key, value);
                                        } else if (onUpdateViewConfig) {
                                            onUpdateViewConfig(targetName, key, value);
                                        }
                                    };

                                    // Update other configs
                                    if (originalConfig.openMode !== newConfig.openMode) updateFn("db-open-mode", newConfig.openMode);
                                    if (originalConfig.showContent !== newConfig.showContent) updateFn("db-show-content", newConfig.showContent ? "true" : "false");
                                    if (originalConfig.contentHeight !== newConfig.contentHeight) updateFn("db-content-height", newConfig.contentHeight);

                                    // Serialize filters and sorts
                                    updateFn("db-filter", JSON.stringify(newConfig.filters));
                                    updateFn("db-sort", JSON.stringify(newConfig.sorts));

                                    setEditingView(null);
                                }}
                                onDelete={() => {
                                    if (onDeleteView) {
                                        onDeleteView(editingView);
                                    }
                                    setEditingView(null);
                                }}
                                onClose={() => setEditingView(null)}
                                position={editViewPosition}
                                portalContainer={portalContainer}
                                menuRef={editViewMenuRef}
                                allProperties={allProperties}
                            />
                        )}
                    </div>
                </div>

                <div className="markdown-db-toolbar-right">
                    {/* Search */}
                    <div className={`markdown-db-search-container ${showSearch ? "active" : ""}`} ref={searchContainerRef}>
                        {!showSearch && (
                            <button
                                className="markdown-db-toolbar-text-btn"
                                onClick={() => setShowSearch(true)}
                                title="Search"
                            >
                                <Icon name="search" />
                            </button>
                        )}
                        {showSearch && (
                            <>
                                <span className="markdown-db-search-icon"><Icon name="search" /></span>
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Search..."
                                    onChange={(e) => onSearch(e.target.value)}
                                    className="markdown-db-search-input"
                                />
                            </>
                        )}
                    </div>

                    {/* Filter Button */}
                    <div style={{ position: "relative" }}>
                        <button
                            ref={filterRef}
                            className={`markdown-db-toolbar-text-btn ${showFilter ? "active" : ""} ${(config.filters && config.filters.length > 0) ? "has-active" : ""}`}
                            onClick={handleFilterClick}
                        >
                            <span style={{ display: "flex", alignItems: "center", color: (config.filters && config.filters.length > 0) ? "var(--interactive-accent)" : "inherit" }}>
                                <Icon name="filter" />
                            </span>
                            {config.filters && config.filters.length > 0 && (
                                <span style={{
                                    background: "var(--interactive-accent)",
                                    color: "var(--text-on-accent)",
                                    borderRadius: "10px",
                                    padding: "0 5px",
                                    fontSize: "10px",
                                    height: "16px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}>
                                    {config.filters.length}
                                </span>
                            )}
                        </button>
                        {showFilter && ReactDOM.createPortal(
                            <div
                                className="markdown-db-menu"
                                ref={filterMenuRef}
                                onMouseDown={(e) => e.nativeEvent.stopImmediatePropagation()}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    top: filterPosition.top,
                                    left: filterPosition.left,
                                    zIndex: 9999
                                }}
                            >
                                <div className="markdown-db-menu-header">
                                    {config.filters && config.filters.length > 0 ? "Filters" : "No filters applied"}
                                </div>

                                {(config.filters || []).map((filter, index) => (
                                    <div key={index} className="markdown-db-menu-item">
                                        <div className="markdown-db-menu-row">
                                            <select
                                                className="markdown-db-menu-select"
                                                value={filter.key}
                                                onChange={(e) => {
                                                    const newFilters = [...(config.filters || [])];
                                                    newFilters[index].key = e.target.value;
                                                    handleUpdateFilter(newFilters);
                                                }}
                                            >
                                                {["Name", "Content", ...allProperties].map(p => (
                                                    <option key={p} value={p}>{p}</option>
                                                ))}
                                            </select>
                                            <select
                                                className="markdown-db-menu-select"
                                                value={filter.operator}
                                                onChange={(e) => {
                                                    const newFilters = [...(config.filters || [])];
                                                    newFilters[index].operator = e.target.value as any;
                                                    handleUpdateFilter(newFilters);
                                                }}
                                                style={{ width: "100px", flex: "none" }}
                                            >
                                                <option value="contains">contains</option>
                                                <option value="not_contains">does not contain</option>
                                                <option value="is">is</option>
                                                <option value="is_not">is not</option>
                                                <option value="is_empty">is empty</option>
                                                <option value="is_not_empty">is not empty</option>
                                            </select>
                                            {filter.operator !== "is_empty" && filter.operator !== "is_not_empty" && (
                                                <BufferedInput
                                                    className="markdown-db-menu-input"
                                                    value={filter.value}
                                                    onChange={(val) => {
                                                        const newFilters = [...(config.filters || [])];
                                                        newFilters[index].value = val;
                                                        handleUpdateFilter(newFilters);
                                                    }}
                                                    placeholder="Value..."
                                                />
                                            )}
                                            <button
                                                className="markdown-db-menu-btn-icon"
                                                onClick={() => {
                                                    const newFilters = (config.filters || []).filter((_, i) => i !== index);
                                                    handleUpdateFilter(newFilters);
                                                }}
                                                title="Remove filter"
                                            >
                                                <Icon name="x" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    className="markdown-db-menu-add-btn"
                                    onClick={() => {
                                        const newFilters = [...(config.filters || [])];
                                        newFilters.push({
                                            key: allProperties[0] || "Name",
                                            operator: "contains",
                                            value: ""
                                        });
                                        handleUpdateFilter(newFilters);
                                    }}
                                >
                                    + Add filter
                                </button>
                            </div>,
                            portalContainer || document.body
                        )}
                    </div>

                    {/* Sort Button */}
                    <div style={{ position: "relative" }}>
                        <button
                            ref={sortRef}
                            className={`markdown-db-toolbar-text-btn ${showSort ? "active" : ""} ${(config.sort && config.sort.length > 0) ? "has-active" : ""}`}
                            onClick={handleSortClick}
                        >
                            <span style={{ display: "flex", alignItems: "center", color: (config.sort && config.sort.length > 0) ? "var(--interactive-accent)" : "inherit" }}>
                                <Icon name="arrow-up-down" />
                            </span>
                            {config.sort && config.sort.length > 0 && (
                                <span style={{
                                    background: "var(--interactive-accent)",
                                    color: "var(--text-on-accent)",
                                    borderRadius: "10px",
                                    padding: "0 5px",
                                    fontSize: "10px",
                                    height: "16px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}>
                                    {config.sort.length}
                                </span>
                            )}
                        </button>
                        {showSort && ReactDOM.createPortal(
                            <div
                                className="markdown-db-menu"
                                ref={sortMenuRef}
                                onMouseDown={(e) => e.nativeEvent.stopImmediatePropagation()}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    top: sortPosition.top,
                                    left: sortPosition.left,
                                    zIndex: 9999
                                }}
                            >
                                <div className="markdown-db-menu-header">
                                    {config.sort && config.sort.length > 0 ? "Sorts" : "No sort applied"}
                                </div>

                                {(config.sort || []).map((sort, index) => (
                                    <div key={index} className="markdown-db-menu-item">
                                        <div className="markdown-db-menu-row">
                                            <select
                                                className="markdown-db-menu-select"
                                                value={sort.key}
                                                onChange={(e) => {
                                                    const newSort = [...(config.sort || [])];
                                                    newSort[index].key = e.target.value;
                                                    handleUpdateSort(newSort);
                                                }}
                                            >
                                                {["Name", "Content", ...allProperties].map(p => (
                                                    <option key={p} value={p}>{p}</option>
                                                ))}
                                            </select>
                                            <select
                                                className="markdown-db-menu-select"
                                                value={sort.direction}
                                                onChange={(e) => {
                                                    const newSort = [...(config.sort || [])];
                                                    newSort[index].direction = e.target.value as "asc" | "desc";
                                                    handleUpdateSort(newSort);
                                                }}
                                                style={{ width: "100px", flex: "none" }}
                                            >
                                                <option value="asc">Ascending</option>
                                                <option value="desc">Descending</option>
                                            </select>
                                            <button
                                                className="markdown-db-menu-btn-icon"
                                                onClick={() => {
                                                    const newSort = (config.sort || []).filter((_, i) => i !== index);
                                                    handleUpdateSort(newSort);
                                                }}
                                                title="Remove sort"
                                            >
                                                <Icon name="x" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    className="markdown-db-menu-add-btn"
                                    onClick={() => {
                                        const newSort = [...(config.sort || [])];
                                        newSort.push({
                                            key: allProperties[0] || "Name",
                                            direction: "asc"
                                        });
                                        handleUpdateSort(newSort);
                                    }}
                                >
                                    + Add sort
                                </button>
                            </div>,
                            portalContainer || document.body
                        )}
                    </div>

                    {/* Config Button */}
                    <div className="markdown-db-config-container" ref={configRef}>
                        <button
                            className="markdown-db-toolbar-text-btn"
                            onClick={handleConfigClick}
                            title="Database Settings"
                        >
                            <Icon name="sliders-horizontal" />
                        </button>
                        {showConfig && ReactDOM.createPortal(
                            <div
                                className="markdown-db-config-menu"
                                ref={configMenuRef}
                                style={{
                                    position: "fixed",
                                    top: configPosition.top,
                                    right: configPosition.right,
                                    zIndex: 9999
                                }}
                            >
                                <div className="markdown-db-config-item">
                                    <span className="markdown-db-config-label">Layout</span>
                                    <select
                                        value={config.layout || "table"}
                                        onChange={(e) => {
                                            onUpdateConfig("db-layout", e.target.value);
                                        }}
                                    >
                                        <option value="table">Table</option>
                                    </select>
                                </div>
                                <div className="markdown-db-config-item">
                                    <span className="markdown-db-config-label">Open Mode</span>
                                    <select
                                        value={config.openMode || "modal"}
                                        onChange={(e) => {
                                            onUpdateConfig("db-open-mode", e.target.value);
                                            setShowConfig(false);
                                        }}
                                    >
                                        <option value="modal">Modal</option>
                                        <option value="split">Split Pane</option>
                                        <option value="tab">Current Tab</option>
                                    </select>
                                </div>
                                <div className="markdown-db-config-item" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                    <span className="markdown-db-config-label" style={{ marginBottom: 0 }}>Page Size</span>
                                    <input
                                        type="number"
                                        min="1"
                                        style={{ width: "60px", padding: "2px 6px", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", background: "var(--background-primary)", color: "var(--text-normal)", fontSize: "14px" }}
                                        value={config.pageSize || 25}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            if (!isNaN(val) && val > 0) {
                                                onUpdateConfig("db-page-size", val.toString());
                                            }
                                        }}
                                    />
                                </div>
                                <div className="markdown-db-config-item" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                    <span className="markdown-db-config-label" style={{ marginBottom: 0 }}>Show Content</span>
                                    <div
                                        className={`checkbox-container ${config.showContent !== false ? "is-enabled" : ""}`}
                                        onClick={() => {
                                            const newVal = config.showContent === false ? "true" : "false";
                                            onUpdateConfig("db-show-content", newVal);
                                        }}
                                    >
                                        <input type="checkbox" tabIndex={0} />
                                    </div>
                                </div>
                                {config.showContent !== false && (
                                    <div className="markdown-db-config-item" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                        <span className="markdown-db-config-label" style={{ marginBottom: 0 }}>Adaptive Height</span>
                                        <div
                                            className={`checkbox-container ${config.contentHeight === "adaptive" ? "is-enabled" : ""}`}
                                            onClick={() => {
                                                const newVal = config.contentHeight === "adaptive" ? "compact" : "adaptive";
                                                onUpdateConfig("db-content-height", newVal);
                                            }}
                                        >
                                            <input type="checkbox" tabIndex={0} />
                                        </div>
                                    </div>
                                )}
                            </div>,
                            portalContainer || document.body
                        )}
                    </div>

                    {/* New Record Button - Split Button */}
                    <div className="markdown-db-split-btn">
                        <button
                            className="markdown-db-new-btn-main"
                            onClick={() => onAddRecord()}
                            title="Create new record"
                        >
                            Create
                        </button>
                        <button
                            className="markdown-db-new-btn-arrow"
                            onClick={(e) => {
                                const menu = new Menu();

                                menu.addItem((item) => {
                                    item
                                        .setTitle("Default (No Template)")
                                        .setIcon("file-plus")
                                        .onClick(() => {
                                            onAddRecord();
                                        });
                                });

                                menu.addSeparator();

                                if (templates && templates.length > 0) {
                                    templates.forEach(path => {
                                        const name = path.split("/").pop() || path;
                                        menu.addItem((item) => {
                                            item
                                                .setTitle(name)
                                                .setIcon("file")
                                                .onClick(() => {
                                                    onAddRecord(path);
                                                });
                                        });
                                    });
                                    menu.addSeparator();

                                    menu.addItem((item) => {
                                        item.setTitle("Remove Template...")
                                            .setIcon("trash")
                                            .onClick((evt) => {
                                                const removeMenu = new Menu();
                                                templates.forEach(path => {
                                                    removeMenu.addItem(it => {
                                                        it.setTitle(path)
                                                            .setIcon("trash")
                                                            .onClick(() => onRemoveTemplate?.(path));
                                                    })
                                                });
                                                if (evt instanceof MouseEvent) {
                                                    removeMenu.showAtPosition({ x: evt.clientX, y: evt.clientY });
                                                }
                                            });
                                    });
                                }

                                menu.addItem((item) => {
                                    item
                                        .setTitle("Add Template...")
                                        .setIcon("plus")
                                        .onClick(() => {
                                            onAddTemplate?.();
                                        });
                                });

                                menu.showAtPosition({ x: e.clientX, y: e.clientY });
                            }}
                            title="Select template"
                        >
                            <svg viewBox="0 0 100 100" className="dropdown-icon" width="10" height="10">
                                <path d="M50 70 L10 30 L90 30 Z" fill="currentColor" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
