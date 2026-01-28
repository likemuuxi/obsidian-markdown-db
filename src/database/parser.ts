import { DatabaseData, DatabaseRecord, DatabaseConfig, parseTypedValue, TypedValue, VALID_PROPERTY_TYPES, PropertyType } from "./schema";
import { extractProperties } from "./utils";

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

    // Regex to find %% block
    const commentBlockRegex = /%%(.*?)%%/;

    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Toggle code block state
        if (line.trim().startsWith("```")) {
            inCodeBlock = !inCodeBlock;
        }

        // Check for H1 (File Title)
        if (!inCodeBlock && line.startsWith("# ") && !title) {
            title = line.substring(2).trim();
            continue;
        }

        // Check for H2 (Record)
        if (!inCodeBlock && line.startsWith("## ")) {
            // Close previous record
            if (currentRecord) {
                currentRecord.lineEnd = i - 1;
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
                    // Global Config
                    handleConfigProperty(key, typedValue, config);
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
