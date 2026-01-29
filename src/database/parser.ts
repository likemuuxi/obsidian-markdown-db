import { DatabaseData, DatabaseRecord, DatabaseConfig, parseTypedValue, TypedValue, VALID_PROPERTY_TYPES, PropertyType } from "./schema";
import { extractProperties } from "./utils";

export const parseFile = (content: string): DatabaseData => {
    const lines = content.split(/\r?\n/);
    const records: DatabaseRecord[] = [];
    let currentRecord: DatabaseRecord | null = null;
    const allKeys = new Set<string>();
    let title = "";

    // Default config
    const defaultConfig: DatabaseConfig = {
        openMode: "split",
        layout: "table",
        contentHeight: "compact"
    };
    
    // Copy for global config
    const config: DatabaseConfig = { ...defaultConfig };
    
    // Views
    const views: Record<string, DatabaseConfig> = {};
    let currentViewName: string | null = null;

    // Regex to find %% block
    const commentBlockRegex = /%%(.*?)%%/;

    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Toggle code block state
        if (line.trim().startsWith("```")) {
            inCodeBlock = !inCodeBlock;
        }

        // Check for H1 (File Title or View)
        const trimmedLine = line.trimStart();
        if (!inCodeBlock && trimmedLine.startsWith("# ")) {
            const h1Content = trimmedLine.substring(2).trim();
            if (!title) {
                title = h1Content;
                // Don't continue, might have properties immediately?
                // Actually existing logic used continue, which is fine as properties are usually on next lines
            } else {
                 // Check for View Header: Title-ViewName or Title(ViewName) or Title（ViewName）
                 if (h1Content.startsWith(title)) {
                     const remainder = h1Content.substring(title.length).trim();
                     if (remainder.startsWith("(") && remainder.endsWith(")")) {
                         currentViewName = remainder.substring(1, remainder.length - 1).trim();
                     } else if (remainder.startsWith("（") && remainder.endsWith("）")) {
                         currentViewName = remainder.substring(1, remainder.length - 1).trim();
                     }
                     
                     if (currentViewName) {
                        if (!views[currentViewName]) {
                            views[currentViewName] = { ...defaultConfig };
                        }
                     }
                 }
            }
        }

        // Check for H2 (Record)
        if (!inCodeBlock && trimmedLine.startsWith("## ")) {
            // Close previous record
            if (currentRecord) {
                currentRecord.lineEnd = i - 1;
                records.push(currentRecord);
            }
            
            // Reset view context when records start?
            // Usually views are defined before records.
            // If we are in a view definition section, encountering a record ends that section.
            currentViewName = null;

            const recordTitle = trimmedLine.substring(3).trim();
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

        // Parse properties inside %% ... %%
        const commentMatch = line.match(commentBlockRegex);
        if (commentMatch) {
            const blockContent = commentMatch[1];
            const properties = extractProperties(blockContent);
            
            for (const prop of properties) {
                const key = prop.key;
                const rawValue = prop.value;

                const typeMatch = rawValue.match(/^([a-zA-Z]+)\s*\((.*)\)$/);
                let typedValue: TypedValue;

                if (typeMatch) {
                    const potentialType = typeMatch[1].toLowerCase();
                    if (VALID_PROPERTY_TYPES.includes(potentialType as PropertyType)) {
                        typedValue = parseTypedValue(potentialType, typeMatch[2]);
                    } else {
                         // Not a valid type, treat as text
                         typedValue = { type: "text", value: rawValue };
                    }
                } else {
                    // Fallback to text
                    typedValue = { type: "text", value: rawValue };
                }

                if (currentRecord) {
                    if (!currentRecord.properties[key]) {
                        currentRecord.properties[key] = [];
                    }
                    currentRecord.properties[key].push(typedValue);
                    allKeys.add(key);
                    // Mark this line as containing properties for the record
                    currentRecord.propertyLineIndex = i;
                } else {
                    // Global Config or View Config
                    const targetConfig = currentViewName && views[currentViewName] ? views[currentViewName] : config;
                    handleConfigProperty(key, typedValue, targetConfig);
                }
            }
        }

        if (currentRecord && !commentMatch && !line.startsWith("## ")) {
             if (currentRecord.content) {
                 currentRecord.content += "\n" + line;
             } else {
                 currentRecord.content = line;
             }
        }
    }

    if (currentRecord) {
        currentRecord.lineEnd = lines.length - 1;
        records.push(currentRecord);
    }

    return {
        title,
        config,
        views,
        records,
        allKeys
    };
};

function handleConfigProperty(key: string, typedValue: TypedValue, config: DatabaseConfig) {
    const value = String(typedValue.value);
    
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
    } else if (key === "db-show-content") {
        config.showContent = value.toLowerCase() === "true";
    } else if (key === "db-columns") {
        if (value.startsWith("[") && value.endsWith("]")) {
            try {
                const inner = value.substring(1, value.length - 1);
                 config.columnOrder = inner.split(",").map(s => s.trim().replace(/^['"]|['"]$/g, ""));
            } catch (e) {
                // ignore
            }
        }
    } else if (key === "db-sort") {
         if (value.startsWith("[") && value.endsWith("]")) {
             try {
                 config.sort = JSON.parse(value);
             } catch(e) {}
         }
    } else if (key === "db-filter") {
         if (value.startsWith("[") && value.endsWith("]")) {
             try {
                 config.filters = JSON.parse(value);
             } catch(e) {}
         }
    } else if (key === "db-column-types") {
         if (value.startsWith("{") && value.endsWith("}")) {
             try {
                 config.columnTypes = JSON.parse(value);
             } catch(e) {}
         }
    } else if (key === "db-hide-columns") {
        if (value.startsWith("[") && value.endsWith("]")) {
            try {
                config.hiddenColumns = JSON.parse(value);
            } catch (e) {
                 // Fallback to simple split if JSON parse fails (e.g. manual edit without quotes)
                 try {
                    const inner = value.substring(1, value.length - 1);
                    config.hiddenColumns = inner.split(",").map(s => s.trim().replace(/^['"]|['"]$/g, ""));
                 } catch(e2) {}
            }
        }
    }
}
