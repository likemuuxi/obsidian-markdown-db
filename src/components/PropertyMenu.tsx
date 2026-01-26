import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface PropertyMenuProps {
    onClose: () => void;
    onSelect: (name: string) => void;
    position: { x: number, y: number };
    knownProperties: string[];
    existingProperties: string[];
    onSaveToGlobal: (name: string) => void;
    portalContainer?: HTMLElement;
}

export const PropertyMenu: React.FC<PropertyMenuProps> = ({ onClose, onSelect, position, knownProperties, existingProperties, onSaveToGlobal, portalContainer }) => {
    const [name, setName] = useState("");
    const menuRef = useRef<HTMLDivElement>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    // Combine known and existing properties
    const allProps = Array.from(new Set([...knownProperties, ...existingProperties])).sort();

    // Filter properties
    const filteredProps = allProps.filter(p => 
        p.toLowerCase().includes(name.toLowerCase())
    );

    // Determine if we show "Create" option
    // Show create if name is not empty AND name is not in the filtered list (exact match)
    const showCreate = name.trim().length > 0 && !allProps.some(p => p.toLowerCase() === name.trim().toLowerCase());
    
    // Total items in list for keyboard navigation
    const totalItems = filteredProps.length + (showCreate ? 1 : 0);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (totalItems > 0) {
                if (selectedIndex < filteredProps.length) {
                    onSelect(filteredProps[selectedIndex]);
                } else if (showCreate) {
                    onSelect(name.trim());
                }
            } else if (name.trim()) {
                 onSelect(name.trim());
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % totalItems);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
        } else if (e.key === "Escape") {
            onClose();
        }
    };

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [name]);

    const menu = (
        <div 
            ref={menuRef}
            className="markdown-db-property-menu"
            style={{
                position: "fixed",
                top: position.y,
                left: position.x,
                zIndex: 9999,
                width: "280px",
                maxHeight: "400px",
                overflowY: "auto",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column"
            }}
        >
            <div style={{ padding: "10px", borderBottom: "1px solid var(--background-modifier-border)" }}>
                <input
                    type="text"
                    placeholder="Type a property name..."
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid var(--background-modifier-border)" }}
                />
            </div>
            
            <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>
                Select a property
            </div>
            
            <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredProps.map((prop, index) => (
                    <div 
                        key={prop}
                        className={`markdown-db-property-item ${index === selectedIndex ? "is-selected" : ""}`}
                        onClick={() => onSelect(prop)}
                        style={{
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            fontSize: "14px",
                            background: index === selectedIndex ? "var(--background-modifier-hover)" : "transparent",
                            justifyContent: "space-between"
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                    >
                        <span>{prop}</span>
                        {!knownProperties.includes(prop) && (
                            <div
                                title="Save to global properties"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSaveToGlobal(prop);
                                }}
                                className="markdown-db-save-prop-btn"
                                style={{
                                    padding: "0 6px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    fontWeight: "bold",
                                    color: "var(--text-accent)",
                                    background: "var(--background-modifier-border)",
                                    marginLeft: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    height: "20px"
                                }}
                            >
                                +
                            </div>
                        )}
                    </div>
                ))}
                
                {showCreate && (
                    <div 
                        className={`markdown-db-property-item ${selectedIndex === filteredProps.length ? "is-selected" : ""}`}
                        onClick={() => onSelect(name.trim())}
                        style={{
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            fontSize: "14px",
                            borderTop: "1px solid var(--background-modifier-border)",
                            color: "var(--text-accent)",
                            background: selectedIndex === filteredProps.length ? "var(--background-modifier-hover)" : "transparent"
                        }}
                        onMouseEnter={() => setSelectedIndex(filteredProps.length)}
                    >
                        + Create "{name.trim()}"
                    </div>
                )}

                {!showCreate && filteredProps.length === 0 && (
                    <div style={{ padding: "12px", color: "var(--text-muted)", textAlign: "center", fontStyle: "italic" }}>
                        No properties found
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(menu, portalContainer || document.body);
};
