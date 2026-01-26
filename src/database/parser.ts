export interface SortRule {
    key: string;
    direction: "asc" | "desc";
}

export interface FilterRule {
    key: string;
    operator: "contains" | "not_contains" | "is" | "is_not" | "is_empty" | "is_not_empty";
    value: string;
}

export interface DatabaseConfig {
    openMode: "tab" | "split" | "modal";
    layout?: string;
    columnOrder?: string[];
    contentHeight?: "compact" | "adaptive";
    sort?: SortRule[];
    filters?: FilterRule[];
    columnStyles?: Record<string, "text" | "tags">;
}

export interface DatabaseRecord {
    id: string;
    title: string;
    properties: Record<string, string[]>;
    content: string; // Store the body content
    lineStart: number;
    lineEnd: number;
}

export interface DatabaseData {
    title: string;
    config: DatabaseConfig;
    records: DatabaseRecord[];
    allKeys: Set<string>;
}

export const parseFile = (content: string): DatabaseData => {
    const lines = content.split(/\r?\n/);
    const records: DatabaseRecord[] = [];
    let currentRecord: DatabaseRecord | null = null;
    const allKeys = new Set<string>();
    let title = "";

    // Default config
    const config: DatabaseConfig = {
        openMode: "split",
        layout: "table",
        contentHeight: "compact"
    };

    const propertyRegex = /\[(.*?)::(.*?)\]/g;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for H1 (File Title)
        if (line.startsWith("# ") && !title) {
            title = line.substring(2).trim();
            continue;
        }

        // Check for H2 (Record)
        if (line.startsWith("## ")) {
            // Close previous record
            if (currentRecord) {
                currentRecord.lineEnd = i - 1;
                // Capture content from lineStart+1 to lineEnd, excluding property lines if desired
                // For now, let's just capture everything and we can clean it up later or on display
                // Actually, let's capture content as we go or extract it at the end
                // Better approach: accumulate content lines for current record
                records.push(currentRecord);
            }

            const recordTitle = line.substring(3).trim();
            currentRecord = {
                id: recordTitle,
                title: recordTitle,
                properties: {},
                content: "",
                lineStart: i,
                lineEnd: i
            };
            continue;
        }

        // Parse properties
        let match;
        let lineHasProperty = false;
        // Reset regex state for new line
        const currentRegex = new RegExp(propertyRegex); // Clone to avoid state issues if using global
        while ((match = propertyRegex.exec(line)) !== null) {
            lineHasProperty = true;
            const key = match[1].trim();
            let value = match[2].trim();

            // Fix for arrays/JSON containing ']' which confuse the non-greedy regex
            if ((key === "db-filter" || key === "db-sort" || key === "db-column-styles") && (value.startsWith("[") || value.startsWith("{"))) {
                 // If the value looks incomplete (doesn't end with ']' or '}'), try to fetch the full content from the line
                 // This assumes the property format is [key::value] and value contains nested brackets
                 if ((value.startsWith("[") && !value.endsWith("]")) || (value.startsWith("{") && !value.endsWith("}"))) {
                     const greedyRegex = new RegExp(`\\[${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}::(.*)\\]`);
                     const greedyMatch = line.match(greedyRegex);
                     if (greedyMatch) {
                         const greedyValue = greedyMatch[1].trim();
                         // Simple validation: should end with ']'
                         if (greedyValue.endsWith("]")) {
                             value = greedyValue;
                         }
                     }
                 }
            }

            if (currentRecord) {
                // Record property
                if (!currentRecord.properties[key]) {
                    currentRecord.properties[key] = [];
                }
                currentRecord.properties[key].push(value);
                allKeys.add(key);
            } else {
                // Global config property (inline)
                if (key === "db-open-mode") {
                    const val = value.toLowerCase();
                    if (val === "split" || val === "modal" || val === "tab") {
                        config.openMode = val as any;
                    }
                } else if (key === "db-layout") {
                    config.layout = value;
                } else if (key === "db-content-height") {
                    const val = value.toLowerCase();
                    if (val === "compact" || val === "adaptive") {
                        config.contentHeight = val as any;
                    }
                } else if (key === "db-columns") {
                    // Try to parse array
                    if (value.startsWith("[") && value.endsWith("]")) {
                        try {
                            const inner = value.substring(1, value.length - 1);
                            config.columnOrder = inner.split(",").map(s => s.trim()).filter(s => s.length > 0);
                        } catch (e) {
                            console.error("Failed to parse db-columns", e);
                        }
                    } else {
                        // Assume comma separated list
                        config.columnOrder = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
                    }
                } else if (key === "db-sort") {
                    try {
                        // format: [key:asc, key2:desc]
                        let v = value;
                        // Clean up potential trailing brackets from corruption
                        while (v.endsWith("]]")) {
                            v = v.substring(0, v.length - 1);
                        }

                        if (v.startsWith("[") && v.endsWith("]")) {
                            const inner = v.substring(1, v.length - 1);
                            const rules = inner.split(",").map(s => s.trim()).filter(s => s.length > 0);
                            config.sort = rules.map(r => {
                                const parts = r.split(":");
                                return {
                                    key: parts[0].trim(),
                                    direction: (parts[1]?.trim().toLowerCase() === "desc" ? "desc" : "asc") as "asc" | "desc"
                                };
                            });
                        }
                    } catch (e) {
                        console.error("Failed to parse db-sort", e);
                    }
                    } else if (key === "db-column-styles") {
                    try {
                        config.columnStyles = JSON.parse(value);
                    } catch (e) {
                        console.error("Failed to parse db-column-styles", e);
                    }
                } else if (key === "db-filter") {
                     try {
                        // format: [key:operator:value, ...]
                        // value might contain colons, so be careful. 
                        // Simplified format for now: JSON-like structure might be better but let's stick to simple string parsing or JSON
                        // Let's assume JSON for complex filter structures if possible, or a custom format
                        // Custom format: [key|operator|value]
                        if (value.startsWith("[") && value.endsWith("]")) {
                            const inner = value.substring(1, value.length - 1);
                            // This simple split is dangerous if value contains commas. 
                            // For MVP, assume simple values.
                             // Actually, let's use JSON for filters to be safe, but user has to write JSON? No, the UI writes it.
                             // Let's use a simpler separator like | inside the rule, and , between rules?
                             // But standard CSV split is tricky.
                             // Let's try to parse as JSON first (if it starts with [{)
                             if (inner.startsWith("{")) {
                                 // It's likely JSON array content without brackets? Or just parse value
                                 config.filters = JSON.parse(value);
                             } else {
                                 // Legacy/Simple format parsing if needed
                             }
                        }
                     } catch (e) {
                         // Fallback: try parsing the whole value as JSON
                         try {
                             config.filters = JSON.parse(value);
                         } catch (e2) {
                             // Try to fix corrupted values (e.g. trailing ']]]') by removing trailing brackets
                             let v = value;
                             let parsed = false;
                             // Try removing up to 5 trailing brackets
                             for (let i = 0; i < 5; i++) {
                                 if (v.endsWith("]")) {
                                     v = v.substring(0, v.length - 1);
                                     try {
                                         config.filters = JSON.parse(v);
                                         parsed = true;
                                         break;
                                     } catch (e3) {}
                                 } else {
                                     break;
                                 }
                             }
                             
                             if (!parsed) {
                                console.error("Failed to parse db-filter", e2);
                             }
                         }
                     }
                }
            }
        }

        if (currentRecord && !lineHasProperty && !line.startsWith("## ")) {
             // Append to content if it's not a property line
             if (currentRecord.content) {
                 currentRecord.content += "\n" + line;
             } else {
                 currentRecord.content = line;
             }
        }
    }

    // Push the last record
    if (currentRecord) {
        currentRecord.lineEnd = lines.length - 1;
        records.push(currentRecord);
    }

    return {
        title,
        config,
        records,
        allKeys
    };
};
