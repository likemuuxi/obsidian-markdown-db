import * as React from "react";
import { useState, useEffect, useRef } from "react";
import * as ReactDOM from "react-dom";
import { App, MarkdownRenderer, Component, htmlToMarkdown, Notice, TFile } from "obsidian";
import { PropertyType } from "../database/schema";

interface EditableCellProps {
    value: string;
    editValue?: string;
    onSave: (newValue: string) => void;
    placeholder?: string;
    className?: string;
    app: App;
    component: Component;
    sourcePath: string;
    onLinkClick?: () => void;
    isContentColumn?: boolean;
    suggestions?: string[];
    isPropertyColumn?: boolean;
    propertyKey?: string;
    onRemoveGlobalValue?: (key: string, value: string) => void;
    contentHeight?: "compact" | "adaptive";
    portalContainer?: HTMLElement;
    type?: PropertyType;
}

const TAG_COLORS = [
    "var(--tag-color-1)",
    "var(--tag-color-2)",
    "var(--tag-color-3)",
    "var(--tag-color-4)",
    "var(--tag-color-5)",
    "var(--tag-color-6)",
    "var(--tag-color-7)",
    "var(--tag-color-8)",
];

const getTagColor = (text: string) => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % TAG_COLORS.length;
    return TAG_COLORS[index];
};

export const EditableCell: React.FC<EditableCellProps> = ({ value, editValue, onSave, placeholder, className, app, component, sourcePath, onLinkClick, isContentColumn, suggestions = [], isPropertyColumn, propertyKey, onRemoveGlobalValue, contentHeight = "compact", portalContainer, type }) => {
    const [isEditing, setIsEditing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    
    // Determine render mode based on type
    const isTagMode = isPropertyColumn && (type === "multi" || type === "select");
    const isCheckboxMode = isPropertyColumn && type === "boolean";
    const isDateMode = isPropertyColumn && type === "date";
    const isNumberMode = isPropertyColumn && type === "number";
    
    // Property specific state
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Suggestion state
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionCoords, setSuggestionCoords] = useState<{ top: number; left: number } | null>(null);
    const [editCoords, setEditCoords] = useState<{ top: number; left: number; width: number } | null>(null);

    // File suggestion state (Standard Column)
    interface SuggestionItem {
        type: 'file' | 'heading' | 'block';
        file: TFile;
        heading?: string;
        blockId?: string;
        displayText: string;
        path: string;
    }
    const [fileSuggestions, setFileSuggestions] = useState<SuggestionItem[]>([]);
    const [showFileSuggestions, setShowFileSuggestions] = useState(false);
    const [fileSuggestionIndex, setFileSuggestionIndex] = useState(0);
    const [fileSuggestionCoords, setFileSuggestionCoords] = useState<{ top: number; left: number } | null>(null);

    // --- PROPERTY COLUMN LOGIC ---
    
    const tags = React.useMemo(() => {
        if (!value || !isTagMode) return [];
        return value.split(",").map(s => s.trim()).filter(s => s.length > 0);
    }, [value, isTagMode]);

    const handleAddTag = (tag: string) => {
        const trimmed = tag.trim();
        if (!trimmed) return;
        
        let newTags: string[];
        
        if (type === "select") {
            // Single select: replace existing
            newTags = [trimmed];
        } else {
            // Multi select: append
            // Don't add if already exists
            if (tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
                 setInputValue("");
                 return; 
            }
            newTags = [...tags, trimmed];
        }
        
        onSave(newTags.join(", "));
        setInputValue("");
        setShowSuggestions(false);
        // Keep focus
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleRemoveTag = (index: number, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent re-entering edit mode if clicking X
        const newTags = tags.filter((_, i) => i !== index);
        onSave(newTags.join(", "));
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const updateSuggestions = (text: string) => {
        if (!suggestions || suggestions.length === 0) {
            setFilteredSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        const lower = text.toLowerCase();
        // Filter suggestions that are not already tags
        const available = suggestions.filter(s => !tags.some(t => t.toLowerCase() === s.toLowerCase()));
        const filtered = available.filter(s => s.toLowerCase().includes(lower));
        setFilteredSuggestions(filtered);
        
        if (filtered.length > 0 && inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setSuggestionCoords({
                top: rect.bottom + 4,
                left: rect.left
            });
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
        setSuggestionIndex(0);
    };

    const handlePropertyKeyDown = (e: React.KeyboardEvent) => {
        if (showSuggestions && filteredSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSuggestionIndex(prev => (prev + 1) % filteredSuggestions.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSuggestionIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag(filteredSuggestions[suggestionIndex]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setShowSuggestions(false);
                return;
            }
        }

        if (e.key === "Enter") {
            e.preventDefault();
            handleAddTag(inputValue);
        } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
            // Remove last tag on backspace if input is empty
            const newTags = [...tags];
            newTags.pop();
            onSave(newTags.join(", "));
        }
    };

    useEffect(() => {
        if (isEditing && isPropertyColumn) {
            // Use a small timeout to ensure the input is mounted and layout is ready
            const timer = setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    updateSuggestions(inputValue);
                }
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isEditing, isPropertyColumn]);

    // Scroll property suggestions into view
    useEffect(() => {
        if (showSuggestions && filteredSuggestions.length > 0) {
            const suggestionsEl = document.querySelector(".markdown-db-suggestions.property-suggestions");
            if (suggestionsEl) {
                const selectedEl = suggestionsEl.children[suggestionIndex] as HTMLElement;
                if (selectedEl) {
                    selectedEl.scrollIntoView({ block: "nearest" });
                }
            }
        }
    }, [suggestionIndex, showSuggestions, filteredSuggestions]);

    // Scroll file suggestions into view
    useEffect(() => {
        if (showFileSuggestions && fileSuggestions.length > 0) {
            const suggestionsEl = document.querySelector(".markdown-db-suggestions.file-suggestions");
            if (suggestionsEl) {
                const selectedEl = suggestionsEl.children[fileSuggestionIndex] as HTMLElement;
                if (selectedEl) {
                    selectedEl.scrollIntoView({ block: "nearest" });
                }
            }
        }
    }, [fileSuggestionIndex, showFileSuggestions, fileSuggestions]);

    // --- STANDARD COLUMN LOGIC (Name/Content) ---
    // This part is preserved from the original component but simplified to remove the old suggestion logic
    // since we only use suggestions for properties now.

    useEffect(() => {
        if (viewRef.current) {
            viewRef.current.empty();
            // Always render with MarkdownRenderer to support formatting in Content column too
            // CSS handles truncation for single-line view
            MarkdownRenderer.render(app, value || "", viewRef.current, sourcePath, component);
        }
    }, [value, app, sourcePath, component, isContentColumn, isPropertyColumn]);

    useEffect(() => {
        if (!isPropertyColumn && isEditing && contentRef.current) {
            const valToSet = editValue !== undefined ? editValue : value;
            contentRef.current.innerText = valToSet;
            
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(contentRef.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            
            contentRef.current.focus();
        }
    }, [isEditing, value, editValue, isContentColumn, isPropertyColumn]);

    const checkFileSuggestions = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        
        // Ensure we are in the content ref
        if (!contentRef.current?.contains(node) && node !== contentRef.current) return;

        const targetNode = node.nodeType === Node.TEXT_NODE ? node : node.childNodes[range.startOffset] || node;
        
        if (targetNode.nodeType === Node.TEXT_NODE && targetNode.textContent) {
            const text = targetNode.textContent;
            const cursor = node.nodeType === Node.TEXT_NODE ? range.startOffset : 0;
            const textBefore = text.substring(0, cursor);
            
            // Match [[filename#heading or [[filename or [[#heading or [[filename^block or [[^block
            const match = textBefore.match(/(?:^|[^\[])(\[\[)([^\]]*)$/);
            
            if (match) {
                const query = match[2];
                const offset = match[0].startsWith("[[") ? 0 : 1;
                const matchIndex = match.index! + offset;
                
                // Parse query for file, heading, or block
                // Check for last occurrence of # or ^ to determine mode
                const hashIndex = query.lastIndexOf("#");
                const caretIndex = query.lastIndexOf("^");
                
                let separator = "";
                let separatorIndex = -1;
                
                if (caretIndex > hashIndex) {
                    separator = "^";
                    separatorIndex = caretIndex;
                } else if (hashIndex > caretIndex) {
                    separator = "#";
                    separatorIndex = hashIndex;
                }
                
                let filePart = query;
                let filterPart = "";
                
                if (separator) {
                    filePart = query.substring(0, separatorIndex);
                    filterPart = query.substring(separatorIndex + 1);
                }

                // Auto-complete filename if missing when using # or ^
                if ((separator === "#" || separator === "^") && !filePart) {
                    const currentFile = app.metadataCache.getFirstLinkpathDest("", sourcePath);
                    if (currentFile) {
                        const filename = currentFile.basename;
                        const newLinkStart = `[[${filename}${separator}`;
                        const newLinkText = `${newLinkStart}${filterPart}`;
                        
                        const textBeforeMatch = textBefore.substring(0, matchIndex);
                        const fullText = targetNode.textContent || "";
                        const textAfterCursor = fullText.substring(cursor);
                        
                        const newFullText = textBeforeMatch + newLinkText + textAfterCursor;
                        targetNode.textContent = newFullText;
                        
                        const newCursor = matchIndex + newLinkStart.length + filterPart.length;
                        try {
                            const newRange = document.createRange();
                            newRange.setStart(targetNode, newCursor);
                            newRange.setEnd(targetNode, newCursor);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        } catch (e) {
                            console.error(e);
                        }
                        
                        // Update variables for suggestion search
                        filePart = filename;
                    }
                }
                
                let suggestions: SuggestionItem[] = [];

                if (separator === "#" || separator === "^") {
                    // Search headings or blocks in specific file
                    let targetFile: TFile | null = null;
                    
                    if (!filePart) {
                        // Current file (or source file of the record)
                        targetFile = app.metadataCache.getFirstLinkpathDest("", sourcePath);
                    } else {
                        targetFile = app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
                    }

                    if (targetFile) {
                        const cache = app.metadataCache.getFileCache(targetFile);
                        if (cache) {
                            if (separator === "#" && cache.headings) {
                                suggestions = cache.headings
                                    .filter(h => !filterPart || h.heading.toLowerCase().includes(filterPart.toLowerCase()))
                                    .map(h => ({
                                        type: 'heading',
                                        file: targetFile!,
                                        heading: h.heading,
                                        displayText: h.heading,
                                        path: targetFile!.path
                                    }));
                            } else if (separator === "^" && cache.blocks) {
                                suggestions = Object.keys(cache.blocks)
                                    .filter(id => !filterPart || id.toLowerCase().includes(filterPart.toLowerCase()))
                                    .map(id => ({
                                        type: 'block',
                                        file: targetFile!,
                                        blockId: id,
                                        displayText: id,
                                        path: targetFile!.path
                                    }));
                            }
                        }
                    }
                } else {
                    // Search files
                    const allFiles = app.vault.getFiles();
                    suggestions = allFiles
                        .filter(f => 
                            f.basename.toLowerCase().includes(filePart.toLowerCase()) || 
                            f.path.toLowerCase().includes(filePart.toLowerCase())
                        )
                        .slice(0, 10)
                        .map(f => ({
                            type: 'file',
                            file: f,
                            displayText: f.basename,
                            path: f.path
                        }));
                }
                
                if (suggestions.length > 0) {
                    setFileSuggestions(suggestions);
                    setFileSuggestionIndex(0);
                    setShowFileSuggestions(true);
                    
                    try {
                        const r = document.createRange();
                        r.setStart(targetNode, matchIndex);
                        r.setEnd(targetNode, matchIndex + 2);
                        const rect = r.getBoundingClientRect();
                        setFileSuggestionCoords({
                            top: rect.bottom + 4,
                            left: rect.left
                        });
                    } catch (e) {
                        const rect = range.getBoundingClientRect();
                        setFileSuggestionCoords({
                            top: rect.bottom + 4,
                            left: rect.left
                        });
                    }
                } else {
                    setShowFileSuggestions(false);
                }
            } else {
                setShowFileSuggestions(false);
            }
        } else {
            setShowFileSuggestions(false);
        }
    };

    const handleInsertFileLink = (item: SuggestionItem) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        
        if (node.nodeType !== Node.TEXT_NODE) {
             node = node.childNodes[range.startOffset] || node;
        }

        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent;
            const cursor = range.startOffset;
            const textBefore = text.substring(0, cursor);
            
            const match = textBefore.match(/(?:^|[^\[])(\[\[)([^\]]*)$/);
            
            if (match) {
                 const offset = match[0].startsWith("[[") ? 0 : 1;
                 const matchIndex = match.index! + offset;
                 
                 const before = text.substring(0, matchIndex);
                 const after = text.substring(cursor);
                 
                 let linkText = "";
                  if (item.type === 'file') {
                      linkText = `[[${item.file.basename}]]`;
                  } else if (item.type === 'heading') {
                      linkText = `[[${item.file.basename}#${item.heading}]]`;
                  } else if (item.type === 'block') {
                      linkText = `[[${item.file.basename}^${item.blockId}]]`;
                  }
                  
                  const newText = before + linkText + after;
                 
                 node.textContent = newText;
                 
                 // Move cursor
                 const newCursor = matchIndex + linkText.length;
                 try {
                     const newRange = document.createRange();
                     newRange.setStart(node, newCursor);
                     newRange.setEnd(node, newCursor);
                     selection.removeAllRanges();
                     selection.addRange(newRange);
                 } catch (e) {
                     console.error(e);
                 }
                 
                 setShowFileSuggestions(false);
            }
        }
    };

    const handleStandardBlur = () => {
        if (contentRef.current) {
            const text = contentRef.current.innerText;
            const currentEditValue = editValue !== undefined ? editValue : value;
            if (text !== currentEditValue) {
                onSave(text);
            }
        }
        setIsEditing(false);
    };

    const handleStandardKeyDown = (e: React.KeyboardEvent) => {
        if (showFileSuggestions && fileSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setFileSuggestionIndex(prev => (prev + 1) % fileSuggestions.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setFileSuggestionIndex(prev => (prev - 1 + fileSuggestions.length) % fileSuggestions.length);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                handleInsertFileLink(fileSuggestions[fileSuggestionIndex]);
                return;
            }
            // Handle # and ^ to select file and trigger heading/block search
            if ((e.key === "#" || e.key === "^") && fileSuggestions[fileSuggestionIndex].type === 'file') {
                e.preventDefault();
                const item = fileSuggestions[fileSuggestionIndex];
                
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    let node = range.startContainer;
                    if (node.nodeType !== Node.TEXT_NODE) {
                         node = node.childNodes[range.startOffset] || node;
                    }
                    
                    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                        const text = node.textContent;
                        const cursor = range.startOffset;
                        const textBefore = text.substring(0, cursor);
                        
                        const match = textBefore.match(/(?:^|[^\[])(\[\[)([^\]]*)$/);
                        if (match) {
                             const offset = match[0].startsWith("[[") ? 0 : 1;
                             const matchIndex = match.index! + offset;
                             
                             const before = text.substring(0, matchIndex);
                             const after = text.substring(cursor);
                             
                             const linkText = `[[${item.file.basename}${e.key}`;
                             
                             const newText = before + linkText + after;
                             node.textContent = newText;
                             
                             const newCursor = matchIndex + linkText.length;
                             try {
                                 const newRange = document.createRange();
                                 newRange.setStart(node, newCursor);
                                 newRange.setEnd(node, newCursor);
                                 selection.removeAllRanges();
                                 selection.addRange(newRange);
                                 
                                 // Trigger suggestions update
                                 setTimeout(() => checkFileSuggestions(), 0);
                             } catch (err) {
                                 console.error(err);
                             }
                        }
                    }
                }
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setShowFileSuggestions(false);
                return;
            }
        }

        if (e.key === "Enter") {
            if (isContentColumn && !e.ctrlKey && !e.metaKey) {
                return;
            }
            e.preventDefault();
            contentRef.current?.blur();
        }
        if (e.key === "Escape") {
            setIsEditing(false);
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        
        const clipboardData = e.clipboardData;
        const html = clipboardData.getData("text/html");
        const text = clipboardData.getData("text/plain");

        let contentToInsert = text;

        if (html) {
            // Convert HTML to Markdown
            const markdown = htmlToMarkdown(html);
            if (markdown) {
                contentToInsert = markdown;
            }
        }

        // Insert content at cursor position
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        const textNode = document.createTextNode(contentToInsert);
        range.insertNode(textNode);
        
        // Move cursor to end of inserted text
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const handleViewClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).tagName === "A" || (e.target as HTMLElement).closest("a")) {
            if (onLinkClick) {
                e.preventDefault();
                e.stopPropagation();
                onLinkClick();
            }
            return;
        }
        if (viewRef.current) {
            const rect = viewRef.current.getBoundingClientRect();
            setEditCoords({ top: rect.top, left: rect.left, width: rect.width });
        }
        setIsEditing(true);
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        if (newValue !== value) {
            onSave(newValue);
        }
        setIsEditing(false);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
        }
        if (e.key === "Escape") {
            setIsEditing(false);
        }
    };

    // --- RENDER ---

    if (isCheckboxMode) {
        return (
             <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                 <input 
                    type="checkbox" 
                    checked={value === "true"} 
                    onChange={(e) => onSave(String(e.target.checked))}
                    style={{ cursor: "pointer" }}
                 />
             </div>
        );
    }

    if (isTagMode) {
        return (
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                {/* View Layer - Always rendered to maintain size, hidden when editing */}
                <div 
                    className={`markdown-db-cell-property rendered ${className || ""}`}
                    title={tags.join(", ")}
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setEditCoords({ top: rect.top, left: rect.left, width: rect.width });
                        setIsEditing(true);
                        setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    style={{
                        height: "100%",
                        minHeight: "32px",
                        width: "100%",
                        display: "flex",
                        flexWrap: "nowrap",
                        overflow: "hidden",
                        gap: "4px",
                        padding: "0 8px",
                        alignItems: "center",
                        cursor: "text",
                        visibility: isEditing ? "hidden" : "visible"
                    }}
                >
                    {tags.map((tag, idx) => (
                        <span key={idx} style={{
                            backgroundColor: getTagColor(tag),
                            padding: "0 6px",
                            borderRadius: "3px",
                            fontSize: "13px",
                            lineHeight: "20px",
                            display: "inline-flex",
                            alignItems: "center",
                            color: "var(--text-normal)",
                            whiteSpace: "nowrap",
                            flexShrink: 0
                        }}>
                            {tag}
                        </span>
                    ))}
                </div>

                {/* Edit Layer - Portal positioned over the view layer */}
                {isEditing && editCoords && ReactDOM.createPortal(
                    <div 
                        className="markdown-db-cell-property editing"
                        style={{
                            position: "fixed",
                            top: editCoords.top,
                            left: editCoords.left,
                            width: editCoords.width,
                            minHeight: "32px",
                            height: "auto",
                            maxHeight: "300px",
                            overflowY: "auto",
                            zIndex: 9999,
                            backgroundColor: "var(--background-primary)",
                            border: "2px solid var(--interactive-accent)",
                            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                            padding: "4px",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px",
                            alignItems: "center",
                            boxSizing: "border-box",
                            borderRadius: "4px"
                        }}
                    >
                        {tags.map((tag, idx) => (
                            <span key={idx} style={{
                                backgroundColor: getTagColor(tag),
                                padding: "0 6px",
                                borderRadius: "3px",
                                fontSize: "13px",
                                lineHeight: "20px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                color: "var(--text-normal)",
                                userSelect: "none",
                                whiteSpace: "nowrap"
                            }}>
                                {tag}
                                <span 
                                    onClick={(e) => handleRemoveTag(idx, e)}
                                    onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on click
                                    className="markdown-db-tag-remove"
                                    style={{ 
                                        cursor: "pointer", 
                                        opacity: 0.5, 
                                        fontWeight: "bold",
                                        fontSize: "14px",
                                        lineHeight: "1"
                                    }}
                                    onMouseEnter={(e) => (e.target as HTMLElement).style.opacity = "1"}
                                    onMouseLeave={(e) => (e.target as HTMLElement).style.opacity = "0.5"}
                                >
                                    ×
                                </span>
                            </span>
                        ))}
                        
                        <div style={{ flex: "1", minWidth: "60px", position: "relative" }}>
                            <input
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    updateSuggestions(e.target.value);
                                }}
                                onFocus={() => updateSuggestions(inputValue)}
                                onKeyDown={handlePropertyKeyDown}
                                onBlur={() => {
                                    setTimeout(() => {
                                        setIsEditing(false);
                                        setShowSuggestions(false);
                                        setInputValue("");
                                    }, 200);
                                }}
                                style={{
                                    border: "none",
                                    background: "transparent",
                                    outline: "none",
                                    width: "100%",
                                    padding: "0",
                                    margin: "0",
                                    fontSize: "inherit",
                                    color: "var(--text-normal)",
                                    height: "24px"
                                }}
                                placeholder={tags.length === 0 ? "Add option..." : ""}
                                autoFocus
                            />
                            {showSuggestions && suggestionCoords && ReactDOM.createPortal(
                                <div className="markdown-db-suggestions property-suggestions" style={{
                                    position: "fixed",
                                    top: suggestionCoords.top,
                                    left: suggestionCoords.left,
                                    minWidth: "180px",
                                    maxHeight: "200px",
                                    overflowY: "auto",
                                    backgroundColor: "var(--background-primary)",
                                    border: "1px solid var(--background-modifier-border)",
                                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                    zIndex: 9999,
                                    borderRadius: "4px"
                                }}>
                                    {filteredSuggestions.map((suggestion, index) => (
                                        <div
                                            key={suggestion}
                                            className={`suggestion-item ${index === suggestionIndex ? "is-selected" : ""}`}
                                            onMouseDown={(e) => {
                                                if ((e.target as HTMLElement).closest(".suggestion-delete")) return;
                                                e.preventDefault(); 
                                                handleAddTag(suggestion);
                                            }}
                                            style={{
                                                padding: "6px 10px",
                                                cursor: "pointer",
                                                backgroundColor: index === suggestionIndex ? "var(--background-modifier-hover)" : "transparent",
                                                fontSize: "13px",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center"
                                            }}
                                            onMouseEnter={() => setSuggestionIndex(index)}
                                        >
                                            <span>{suggestion}</span>
                                            {onRemoveGlobalValue && propertyKey && (
                                                <span 
                                                    className="suggestion-delete"
                                                    style={{
                                                        opacity: 0.5,
                                                        cursor: "pointer",
                                                        padding: "0 4px",
                                                        fontWeight: "bold",
                                                        marginLeft: "8px"
                                                    }}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        onRemoveGlobalValue(propertyKey, suggestion);
                                                        // Update local state to reflect removal immediately
                                                        setFilteredSuggestions(prev => prev.filter(s => s !== suggestion));
                                                    }}
                                                    onMouseEnter={(e) => (e.target as HTMLElement).style.opacity = "1"}
                                                    onMouseLeave={(e) => (e.target as HTMLElement).style.opacity = "0.5"}
                                                >
                                                    ×
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>,
                                portalContainer || document.body
                            )}
                        </div>
                    </div>,
                    portalContainer || document.body
                )}
            </div>
        );
    }

    // Standard Render (Name/Content)

    const handleMouseOver = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "A" && target.classList.contains("internal-link")) {
            // Stop propagation so parent handlers don't fire (avoids double trigger in View)
            e.stopPropagation();
            
            app.workspace.trigger("hover-link", {
                event: e.nativeEvent,
                source: "markdown-db-view", 
                hoverParent: viewRef.current,
                targetEl: target,
                linktext: target.getAttribute("data-href"),
                sourcePath: sourcePath
            });
        }
    };

    return (
        <div className="markdown-db-cell-container" style={{ position: "relative", width: "100%", height: "100%", minHeight: "32px" }}>
            {!isEditing && (
                <div
                    className="markdown-db-copy-button"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        navigator.clipboard.writeText(value);
                        new Notice("Copied to clipboard");
                    }}
                    title="Copy"
                    dangerouslySetInnerHTML={{
                        __html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-copy"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`
                    }}
                />
            )}
            {/* View Layer - Always rendered to maintain size, hidden when editing */}
            <div
                ref={viewRef}
                className={`markdown-db-cell-content rendered ${className || ""} ${contentHeight === "adaptive" ? "adaptive-height" : ""}`}
                title={value}
                onClick={handleViewClick}
                onMouseOver={handleMouseOver}
                style={{
                    cursor: "text",
                    visibility: isEditing ? "hidden" : "visible"
                }}
            />

            {/* Edit Layer - Portal positioned over the view layer */}
            {isEditing && editCoords && ReactDOM.createPortal(
                isDateMode ? (
                    <input
                        ref={inputRef}
                        type="date"
                        defaultValue={value}
                        onBlur={handleInputBlur}
                        onKeyDown={handleInputKeyDown}
                        className={`markdown-db-cell-content editing ${className || ""}`}
                        style={{
                            position: "fixed",
                            top: editCoords.top,
                            left: editCoords.left,
                            width: editCoords.width,
                            minHeight: "32px",
                            height: "32px",
                            zIndex: 9999,
                            backgroundColor: "var(--background-primary)",
                            border: "2px solid var(--interactive-accent)",
                            boxSizing: "border-box",
                            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                            padding: "0 8px 0 30px",
                            margin: 0,
                            fontFamily: "inherit",
                            fontSize: "14px",
                            borderRadius: "4px"
                        }}
                    />
                ) : isNumberMode ? (
                    <input
                        ref={inputRef}
                        type="number"
                        defaultValue={value}
                        onBlur={handleInputBlur}
                        onKeyDown={handleInputKeyDown}
                        className={`markdown-db-cell-content editing ${className || ""}`}
                        style={{
                            position: "fixed",
                            top: editCoords.top,
                            left: editCoords.left,
                            width: editCoords.width,
                            minHeight: "32px",
                            height: "32px",
                            zIndex: 9999,
                            backgroundColor: "var(--background-primary)",
                            border: "2px solid var(--interactive-accent)",
                            boxSizing: "border-box",
                            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                            padding: "0 8px",
                            margin: 0,
                            fontFamily: "inherit",
                            fontSize: "14px",
                            borderRadius: "4px"
                        }}
                    />
                ) : (
                    <>
                    <div
                        ref={contentRef}
                        contentEditable={true}
                        suppressContentEditableWarning={true}
                        onBlur={handleStandardBlur}
                        onKeyDown={handleStandardKeyDown}
                        onInput={checkFileSuggestions}
                        onPaste={handlePaste}
                        className={`markdown-db-cell-content editing ${className || ""}`}
                        style={{
                            outline: "none",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            position: "fixed",
                            top: editCoords.top,
                            left: editCoords.left,
                            width: editCoords.width,
                            minHeight: "32px",
                            height: "auto",
                            maxHeight: "50vh",
                            overflowY: "auto",
                            zIndex: 9999,
                            backgroundColor: "var(--background-primary)",
                            border: "2px solid var(--interactive-accent)",
                            boxSizing: "border-box",
                            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                            padding: "6px 8px",
                            margin: 0,
                            lineHeight: "1.5",
                            fontFamily: "inherit",
                            fontSize: "14px",
                            borderRadius: "4px"
                        }}
                    />
                    {showFileSuggestions && fileSuggestionCoords && ReactDOM.createPortal(
                        <div className="markdown-db-suggestions file-suggestions" style={{
                            position: "fixed",
                            top: fileSuggestionCoords.top,
                            left: fileSuggestionCoords.left,
                            minWidth: "200px",
                            maxHeight: "200px",
                            overflowY: "auto",
                            backgroundColor: "var(--background-primary)",
                            border: "1px solid var(--background-modifier-border)",
                            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                            zIndex: 10000,
                            borderRadius: "4px"
                        }}>
                            {fileSuggestions.map((item, index) => (
                                <div
                                    key={item.path + (item.heading ? "#" + item.heading : "")}
                                    className={`suggestion-item ${index === fileSuggestionIndex ? "is-selected" : ""}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleInsertFileLink(item);
                                    }}
                                    style={{
                                        padding: "6px 10px",
                                        cursor: "pointer",
                                        backgroundColor: index === fileSuggestionIndex ? "var(--background-modifier-hover)" : "transparent",
                                        fontSize: "13px",
                                        display: "flex",
                                        alignItems: "center"
                                    }}
                                    onMouseEnter={() => setFileSuggestionIndex(index)}
                                >
                                    <div style={{ marginRight: "8px", opacity: 0.7 }}>
                                        {item.type === 'file' && (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                        )}
                                        {item.type === 'heading' && (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/></svg>
                                        )}
                                        {item.type === 'block' && (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{item.displayText}</div>
                                        {item.type === 'file' && <div style={{ fontSize: "11px", opacity: 0.6 }}>{item.path}</div>}
                                        {item.type === 'heading' && <div style={{ fontSize: "11px", opacity: 0.6 }}>{item.file.basename}</div>}
                                        {item.type === 'block' && <div style={{ fontSize: "11px", opacity: 0.6 }}>{item.file.basename}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>,
                        document.body
                    )}
                    </>
                ),
                portalContainer || document.body
            )}
        </div>
    );
};