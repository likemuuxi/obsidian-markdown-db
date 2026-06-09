import { DatabaseData, DatabaseRecord, DatabaseConfig, parseTypedValue, TypedValue, VALID_PROPERTY_TYPES, PropertyType } from "./schema";
import { extractProperties } from "./utils";

function getHeadingLevel(line: string): number | null {
    const match = line.match(/^(#{1,6})\s/);
    if (match) {
        return match[1].length;
    }
    return null;
}

function unwrapContentCodeBlock(content: string | undefined): string {
    if (!content) return "";
    const trimmed = content.trim();
    if (trimmed.startsWith("```markdown\n") && trimmed.endsWith("\n```")) {
        return trimmed.substring("```markdown\n".length, trimmed.length - "\n```".length);
    }
    if (trimmed.startsWith("```\n") && trimmed.endsWith("\n```")) {
        return trimmed.substring("```\n".length, trimmed.length - "\n```".length);
    }
    return content;
}

export const parseFile = (content: string): DatabaseData => {
    const lines = content.split(/\r?\n/);
    const flatRecords: DatabaseRecord[] = [];
    let currentRecord: DatabaseRecord | null = null;
    const allKeys = new Set<string>();
    let title = "";

    const defaultConfig: DatabaseConfig = {
        openMode: "modal",
        layout: "table",
        contentHeight: "compact"
    };

    const config: DatabaseConfig = { ...defaultConfig };

    const views: Record<string, DatabaseConfig> = {};
    let currentViewName: string | null = null;

    let inCodeBlock = false;
    let inCommentBlock = false;
    let commentBlockContent = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim().startsWith("```")) {
            inCodeBlock = !inCodeBlock;
        }

        const trimmedLine = line.trimStart();

        if (!inCodeBlock) {
            const headingLevel = getHeadingLevel(trimmedLine);

            if (headingLevel !== null) {
                if (headingLevel === 1) {
                    const h1Content = trimmedLine.substring(2).trim();
                    if (!title) {
                        title = h1Content;
                    } else {
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
                    continue;
                }

                if (headingLevel >= 2) {
                    if (currentRecord) {
                        currentRecord.lineEnd = i - 1;
                        flatRecords.push(currentRecord);
                    }

                    if (headingLevel === 2) {
                        currentViewName = null;
                    }

                    const headingPrefix = "#".repeat(headingLevel);
                    const recordTitle = trimmedLine.substring(headingPrefix.length).trim();
                    currentRecord = {
                        id: recordTitle,
                        title: recordTitle,
                        properties: {},
                        content: "",
                        lineStart: i,
                        lineEnd: i,
                        level: headingLevel - 1,
                        depth: 1,
                        parentId: null,
                        children: []
                    };
                    continue;
                }
            }
        }

        const trimmedForComment = line.trim();

        if (!inCodeBlock && inCommentBlock) {
            if (trimmedForComment.endsWith("%%")) {
                inCommentBlock = false;
                const endIdx = line.lastIndexOf("%%");
                commentBlockContent += line.substring(0, endIdx);
                processProperties(commentBlockContent, currentRecord, currentViewName, views, config, allKeys, i);
                commentBlockContent = "";
            } else {
                commentBlockContent += line + "\n";
            }
            continue;
        } else if (!inCodeBlock && trimmedForComment.startsWith("%%")) {
            if (trimmedForComment.endsWith("%%") && trimmedForComment.length >= 4) {
                const blockContent = trimmedForComment.substring(2, trimmedForComment.length - 2);
                processProperties(blockContent, currentRecord, currentViewName, views, config, allKeys, i);
            } else {
                inCommentBlock = true;
                const startIdx = line.indexOf("%%");
                commentBlockContent = line.substring(startIdx + 2) + "\n";
            }
            continue;
        }

        if (currentRecord && !inCommentBlock) {
            if (currentRecord.content) {
                currentRecord.content += "\n" + line;
            } else {
                currentRecord.content = line;
            }
        }
    }

    if (currentRecord) {
        currentRecord.lineEnd = lines.length - 1;
        flatRecords.push(currentRecord);
    }

    for (const record of flatRecords) {
        record.content = unwrapContentCodeBlock(record.content);
    }

    const records = buildHierarchy(flatRecords);

    return {
        title,
        config,
        views,
        records,
        allKeys
    };
};

function buildHierarchy(flatRecords: DatabaseRecord[]): DatabaseRecord[] {
    const rootRecords: DatabaseRecord[] = [];
    const stack: DatabaseRecord[] = [];

    for (const record of flatRecords) {
        while (stack.length > 0 && stack[stack.length - 1].level >= record.level) {
            stack.pop();
        }

        if (stack.length > 0) {
            const parent = stack[stack.length - 1];
            record.parentId = parent.id;
            parent.children.push(record);
        } else {
            record.parentId = null;
            rootRecords.push(record);
        }

        stack.push(record);
    }

    const assignDepth = (records: DatabaseRecord[], baseDepth: number) => {
        for (const record of records) {
            record.depth = baseDepth;
            if (record.children.length > 0) {
                assignDepth(record.children, baseDepth + 1);
            }
        }
    };
    assignDepth(rootRecords, 1);

    return rootRecords;
}

export function flattenRecords(records: DatabaseRecord[]): DatabaseRecord[] {
    const result: DatabaseRecord[] = [];
    for (const record of records) {
        result.push(record);
        if (record.children.length > 0) {
            result.push(...flattenRecords(record.children));
        }
    }
    return result;
}

function processProperties(blockContent: string, currentRecord: DatabaseRecord | null, currentViewName: string | null, views: Record<string, DatabaseConfig>, config: DatabaseConfig, allKeys: Set<string>, lineIndex: number) {
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
                typedValue = { type: "text", value: rawValue };
            }
        } else {
            typedValue = { type: "text", value: rawValue };
        }

        if (currentRecord) {
            if (!currentRecord.properties[key]) {
                currentRecord.properties[key] = [];
            }
            currentRecord.properties[key].push(typedValue);
            allKeys.add(key);
            currentRecord.propertyLineIndex = lineIndex;
        } else {
            const targetConfig = currentViewName && views[currentViewName] ? views[currentViewName] : config;
            handleConfigProperty(key, typedValue, targetConfig);
        }
    }
}

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
            } catch (e) { }
        }
    } else if (key === "db-filter") {
        if (value.startsWith("[") && value.endsWith("]")) {
            try {
                config.filters = JSON.parse(value);
            } catch (e) { }
        }
    } else if (key === "db-column-types") {
        if (value.startsWith("{") && value.endsWith("}")) {
            try {
                config.columnTypes = JSON.parse(value);
            } catch (e) { }
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
                } catch (e2) { }
            }
        }
    } else if (key === "db-page-size") {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed > 0) {
            config.pageSize = parsed;
        }
    }
}
