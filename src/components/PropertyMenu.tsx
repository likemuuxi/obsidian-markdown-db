import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { getIcon } from "obsidian";
import { PropertyType, PROPERTY_TYPE_ICONS } from "../database/schema";
import { PropertyConfig } from "../settings";

interface PropertyMenuProps {
    onClose: () => void;
    onSelect: (name: string, type?: PropertyType) => void;
    position: { x: number, y: number };
    globalProperties: PropertyConfig[];
    existingProperties: string[];
    onSaveToGlobal: (name: string, type?: PropertyType) => void;
    portalContainer?: HTMLElement;
    propertyTypes?: Record<string, PropertyType>;
}

export const PropertyMenu: React.FC<PropertyMenuProps> = ({ onClose, onSelect, position, globalProperties, existingProperties, onSaveToGlobal, portalContainer, propertyTypes }) => {
    const [step, setStep] = useState<'type' | 'name'>('type');
    const [name, setName] = useState("");
    const [selectedType, setSelectedType] = useState<PropertyType>("text");
    const menuRef = useRef<HTMLDivElement>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const availableTypes: PropertyType[] = ["text", "number", "boolean", "date", "select", "multi", "link"];

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
    const globalPropNames = globalProperties.map(p => p.name);
    const allProps = Array.from(new Set([...globalPropNames, ...existingProperties])).sort();

    // Filter properties
    const filteredProps = allProps.filter(p => {
        const nameMatch = p.toLowerCase().includes(name.toLowerCase());
        if (!nameMatch) return false;

        // Check local property types first
        if (propertyTypes && propertyTypes[p]) {
            if (propertyTypes[p] !== selectedType) {
                return false;
            }
        } 
        // Then check global property types
        else {
             const globalProp = globalProperties.find(gp => gp.name === p);
             if (globalProp && globalProp.type !== selectedType) {
                 return false;
             }
        }
        return true;
    });

    // Determine if we show "Create" option
    // Show create if name is not empty AND name is not in the filtered list (exact match)
    const showCreate = name.trim().length > 0 && !allProps.some(p => p.toLowerCase() === name.trim().toLowerCase());
    
    // Total items in list for keyboard navigation
    const totalItems = step === 'type' ? availableTypes.length : (filteredProps.length + (showCreate ? 1 : 0));

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (step === 'type') {
                setSelectedType(availableTypes[selectedIndex]);
                setStep('name');
                setSelectedIndex(0);
                // Focus input is handled by autoFocus on render
            } else {
                if (totalItems > 0) {
                    if (selectedIndex < filteredProps.length) {
                        onSelect(filteredProps[selectedIndex], selectedType);
                    } else if (showCreate) {
                        onSelect(name.trim(), selectedType);
                    }
                } else if (name.trim()) {
                     onSelect(name.trim(), selectedType);
                }
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % totalItems);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
        } else if (e.key === "Escape") {
            onClose();
        } else if (e.key === "ArrowLeft" && step === 'name' && name === "") {
             // Optional: Go back on Left Arrow if input empty
             setStep('type');
             setSelectedIndex(availableTypes.indexOf(selectedType));
        }
    };

    // Reset selection when filter changes
    useEffect(() => {
        if (step === 'name') {
            setSelectedIndex(0);
        }
    }, [name, step]);

    // Initial focus or step change focus management could be tricky with React logic, 
    // but conditional rendering of input with autoFocus usually works.

    const renderTypeSelection = () => (
        <>
            <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", borderBottom: "1px solid var(--background-modifier-border)" }}>
                Select Property Type
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                {availableTypes.map((type, index) => (
                    <div
                        key={type}
                        className={`markdown-db-property-item ${index === selectedIndex ? "is-selected" : ""}`}
                        onClick={() => {
                            setSelectedType(type);
                            setStep('name');
                            setSelectedIndex(0);
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        style={{
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            fontSize: "14px",
                            background: index === selectedIndex ? "var(--background-modifier-hover)" : "transparent",
                            color: "var(--text-normal)"
                        }}
                    >
                        <span 
                            style={{ 
                                display: "inline-flex", 
                                alignItems: "center", 
                                marginRight: "8px",
                                color: "var(--text-muted)",
                                width: "16px",
                                height: "16px"
                            }}
                            dangerouslySetInnerHTML={{ __html: getIcon(PROPERTY_TYPE_ICONS[type])?.outerHTML || "" }}
                        />
                        <span style={{ textTransform: "capitalize" }}>{type}</span>
                    </div>
                ))}
            </div>
        </>
    );

    const renderNameSelection = () => (
        <>
            <div style={{ padding: "10px", borderBottom: "1px solid var(--background-modifier-border)", display: "flex", gap: "8px" }}>
                <div 
                    onClick={() => {
                         setStep('type');
                         setSelectedIndex(availableTypes.indexOf(selectedType));
                    }}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        padding: "4px",
                        borderRadius: "4px",
                    }}
                    title="Back to types"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--background-modifier-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                    <span 
                        style={{ display: "inline-flex", width: "16px", height: "16px" }}
                        dangerouslySetInnerHTML={{ __html: getIcon("arrow-left")?.outerHTML || "" }} 
                    />
                </div>
                <input
                    type="text"
                    placeholder={`Property name (${selectedType})...`}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid var(--background-modifier-border)" }}
                />
            </div>
            
            <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Select property</span>
                <span style={{ 
                    display: "inline-flex", 
                    alignItems: "center", 
                    gap: "4px",
                    background: "var(--background-secondary)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: "1px solid var(--background-modifier-border)"
                }}>
                    <span 
                        style={{ display: "inline-flex", alignItems: "center", width: "12px", height: "12px" }}
                        dangerouslySetInnerHTML={{ __html: getIcon(PROPERTY_TYPE_ICONS[selectedType])?.outerHTML || "" }} 
                    />
                    <span style={{ textTransform: "capitalize" }}>{selectedType}</span>
                </span>
            </div>
            
            <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredProps.map((prop, index) => (
                    <div 
                        key={prop}
                        className={`markdown-db-property-item ${index === selectedIndex ? "is-selected" : ""}`}
                        onClick={() => onSelect(prop, selectedType)}
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
                        {!globalProperties.some(gp => gp.name === prop) && (
                            <div
                                title="Save to global properties"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSaveToGlobal(prop, selectedType);
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
                        style={{
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            fontSize: "14px",
                            borderTop: "1px solid var(--background-modifier-border)",
                            color: "var(--text-accent)",
                            background: selectedIndex === filteredProps.length ? "var(--background-modifier-hover)" : "transparent",
                            justifyContent: "space-between"
                        }}
                        onMouseEnter={() => setSelectedIndex(filteredProps.length)}
                        onClick={() => onSelect(name.trim(), selectedType)}
                    >
                        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                            <span style={{ marginRight: "6px" }}>+ Create "{name.trim()}"</span>
                        </div>
                    </div>
                )}

                {!showCreate && filteredProps.length === 0 && (
                    <div style={{ padding: "12px", color: "var(--text-muted)", textAlign: "center", fontStyle: "italic" }}>
                        No properties found
                    </div>
                )}
            </div>
        </>
    );

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
                flexDirection: "column",
                outline: "none" // Ensure div is focusable for events if needed, but we use input/window events
            }}
            onKeyDown={step === 'type' ? handleKeyDown : undefined} // Attach handler to div for step 1
            tabIndex={-1} // Make div focusable
        >
            {step === 'type' ? renderTypeSelection() : renderNameSelection()}
        </div>
    );

    // Auto-focus menu for keyboard events when in type selection mode
    useEffect(() => {
        if (step === 'type' && menuRef.current) {
            menuRef.current.focus();
        }
    }, [step]);

    return createPortal(menu, portalContainer || document.body);
};
