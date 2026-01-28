import * as React from "react";
import { useState, useRef, useEffect } from "react";
import * as ReactDOM from "react-dom";
import { setIcon } from "obsidian";
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

interface ToolbarProps {
    title: string;
    config: DatabaseConfig;
    onSearch: (term: string) => void;
    onUpdateConfig: (key: string, value: string) => void;
    onAddRecord: () => void;
    onUpdateTitle: (newTitle: string) => void;
    allProperties: string[];
    portalContainer?: HTMLElement;
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(e.target.value);
        onChange(e.target.value);
    };

    return (
        <input
            className={className}
            value={localValue}
            onChange={handleChange}
            placeholder={placeholder}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoFocus={autoFocus}
        />
    );
};

export const Toolbar: React.FC<ToolbarProps> = ({ title, config, onSearch, onUpdateConfig, onAddRecord, onUpdateTitle, allProperties, portalContainer }) => {
    const [showConfig, setShowConfig] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [showSort, setShowSort] = useState(false);
    const [configPosition, setConfigPosition] = useState({ top: 0, right: 0 });
    const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0 });
    const [sortPosition, setSortPosition] = useState({ top: 0, left: 0 });
    
    const configRef = useRef<HTMLDivElement>(null);
    const configMenuRef = useRef<HTMLDivElement>(null);
    const filterRef = useRef<HTMLButtonElement>(null);
    const filterMenuRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLButtonElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    
    const searchRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    // Click outside to close config menu or search
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showConfig && configRef.current && !configRef.current.contains(event.target as Node)) {
                 // Also check if click is inside the portal menu
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
            if (showSearch && searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                // Only close search if it's empty? Or always? Notion keeps it open if text exists usually, but let's close for now
                if (searchRef.current && searchRef.current.value === "") {
                    setShowSearch(false);
                }
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showSearch, showConfig, showFilter, showSort]);

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
    };

    const handleUpdateFilter = (newFilters: FilterRule[]) => {
        // Serialize to JSON string for storage
        onUpdateConfig("db-filter", JSON.stringify(newFilters));
    };

    const handleUpdateSort = (newSort: SortRule[]) => {
        // Serialize to simplified string format: [key:dir, key2:dir]
        const str = "[" + newSort.map(s => `${s.key}:${s.direction}`).join(", ") + "]";
        onUpdateConfig("db-sort", str);
    };

    return (
        <div className="markdown-db-toolbar">
            <div className="markdown-db-toolbar-left">
                <BufferedInput
                    className="markdown-db-title-input"
                    value={title || ""}
                    onChange={(val) => onUpdateTitle(val)}
                    placeholder="Untitled Database"
                />
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
                            style={{
                                top: filterPosition.top,
                                left: filterPosition.left,
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
                            style={{
                                top: sortPosition.top,
                                left: sortPosition.left,
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
                                    value={config.openMode || "split"}
                                    onChange={(e) => {
                                        onUpdateConfig("db-open-mode", e.target.value);
                                        setShowConfig(false);
                                    }}
                                >
                                    <option value="tab">Current Tab</option>
                                    <option value="split">Split Pane</option>
                                    <option value="modal">Modal</option>
                                </select>
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

                {/* New Record Button */}
                <button
                    className="markdown-db-new-btn"
                    onClick={onAddRecord}
                >
                    Create
                </button>
            </div>
        </div>
    );
};
