import { App, TFile, Notice } from "obsidian";
import { TypedValue, formatTypedValue, parseTypedValue, DatabaseRecord } from "./schema";
import { extractProperties } from "./utils";

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRecordHeading(record: DatabaseRecord): string {
    const prefix = "#".repeat(record.level + 1);
    return `${prefix} ${record.id}`;
}

function isHeadingLine(line: string, minLevel: number = 2): boolean {
    const match = line.match(/^(#{2,6})\s/);
    if (match) {
        return match[1].length >= minLevel;
    }
    return false;
}

function isRecordEndLine(line: string, currentLevel: number): boolean {
    const match = line.match(/^(#{1,6})\s/);
    if (match) {
        const level = match[1].length;
        return level <= currentLevel + 1;
    }
    return false;
}

function findRecordStart(lines: string[], record: DatabaseRecord): number {
    const heading = getRecordHeading(record);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === heading) {
            return i;
        }
    }
    return -1;
}

function findRecordEnd(lines: string[], startLine: number, record: DatabaseRecord): number {
    const currentLevel = record.level + 1;
    for (let i = startLine + 1; i < lines.length; i++) {
        const match = lines[i].match(/^(#{1,6})\s/);
        if (match) {
            const level = match[1].length;
            if (level <= currentLevel) {
                return i;
            }
        }
    }
    return lines.length;
}

function findCommentBlock(lines: string[], startIndex: number, endIndex: number) {
    for (let i = startIndex; i < endIndex; i++) {
        const line = lines[i].trim();
        if (line.startsWith("%%")) {
            const blockStartIndex = i;
            let blockEndIndex = i;
            let contentLines: string[] = [line];
            if (!(line.endsWith("%%") && line.length >= 4)) {
                for (let j = i + 1; j < endIndex; j++) {
                    const nextLine = lines[j];
                    contentLines.push(nextLine);
                    if (nextLine.trim().endsWith("%%")) {
                        blockEndIndex = j;
                        break;
                    }
                }
            }
            return {
                startIndex: blockStartIndex,
                endIndex: blockEndIndex,
                content: contentLines.join("\n")
            };
        }
    }
    return null;
}

function upsertPropertyInBlock(blockContent: string, key: string, newPropertyStr: string | null, overwrite: boolean = true): string {
    const properties = extractProperties(blockContent);

    const newProperties: string[] = [];
    let found = false;

    for (const prop of properties) {
        const currentKey = prop.key;

        if (currentKey === key) {
            if (overwrite) {
                if (newPropertyStr !== null) {
                    newProperties.push(newPropertyStr);
                }
                // If null, we skip pushing (delete)
            } else {
                newProperties.push(prop.full); // Keep existing
            }
            found = true;
        } else {
            newProperties.push(prop.full);
        }
    }

    if (!found && newPropertyStr !== null) {
        newProperties.push(newPropertyStr);
    }

    if (newProperties.length === 0) return "";
    return "\n" + newProperties.join("\n") + "\n";
}

export const updateProperty = async (
    app: App,
    file: TFile,
    record: DatabaseRecord,
    key: string,
    newValue: string,
    explicitType?: string
) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);

        let startLine = findRecordStart(lines, record);
        if (startLine === -1) return content;

        let endLine = findRecordEnd(lines, startLine, record);

        // Look for %% block in the record
        let commentBlockStartIndex = -1;
        let commentBlockEndIndex = -1;
        let commentBlockContent = "";

        const blockMatch = findCommentBlock(lines, startLine + 1, endLine);
        if (blockMatch) {
            commentBlockStartIndex = blockMatch.startIndex;
            commentBlockEndIndex = blockMatch.endIndex;
            commentBlockContent = blockMatch.content;
        }

        const shouldDelete = newValue === "" || newValue === null || newValue === undefined;
        let newPropertyStr: string | null = null;

        if (!shouldDelete) {
            let type = explicitType || "text";
            let existingValue: TypedValue | undefined;

            // Only use record type if explicitType is not provided
            if (!explicitType && record.properties[key] && record.properties[key].length > 0) {
                existingValue = record.properties[key][0];
                type = existingValue.type;
            }

            // Create new TypedValue
            const newTypedValue: TypedValue = {
                type: type as any,
                value: newValue
            };

            newPropertyStr = `[${key}::${formatTypedValue(newTypedValue)}]`;
        }

        if (commentBlockStartIndex !== -1) {
            // Update existing block
            let innerContent = commentBlockContent.substring(2, commentBlockContent.length - 2).trim();
            innerContent = upsertPropertyInBlock(innerContent, key, newPropertyStr, true);

            if (innerContent.trim() === "") {
                lines.splice(commentBlockStartIndex, commentBlockEndIndex - commentBlockStartIndex + 1);
            } else {
                lines.splice(commentBlockStartIndex, commentBlockEndIndex - commentBlockStartIndex + 1, `%%${innerContent}%%`);

                // Ensure empty line after if followed by content
                const nextLineIdx = commentBlockStartIndex + 1;
                if (nextLineIdx < lines.length) {
                    const nextLine = lines[nextLineIdx];
                    if (nextLine.trim() !== "") {
                        lines.splice(nextLineIdx, 0, "");
                    }
                }
            }
        } else {
            // Create new block after header
            // Insert at startLine + 1
            if (newPropertyStr !== null) {
                const nextLineIdx = startLine + 1;
                const hasContentFollowing = nextLineIdx < lines.length && lines[nextLineIdx].trim() !== "";

                if (hasContentFollowing) {
                    lines.splice(startLine + 1, 0, `%%\n${newPropertyStr}\n%%`, "");
                } else {
                    lines.splice(startLine + 1, 0, `%%\n${newPropertyStr}\n%%`);
                }
            }
        }

        return lines.join("\n");
    });
};

export const addPropertyToAllRecords = async (app: App, file: TFile, key: string, type: string = "text", defaultValue: string = "") => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const newLines: string[] = [];
        const newPropertyStr = `[${key}::${type}(${defaultValue})]`; // Use provided type

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            if (isHeadingLine(line)) {
                newLines.push(line);

                let nextLineIndex = i + 1;
                let foundBlock = false;

                const blockMatch = findCommentBlock(lines, nextLineIndex, lines.length);
                if (blockMatch && (blockMatch.startIndex === nextLineIndex || (blockMatch.startIndex === nextLineIndex + 1 && lines[nextLineIndex].trim() === ""))) {
                    // Update existing block
                    let innerContent = blockMatch.content.substring(2, blockMatch.content.length - 2).trim();

                    const updatedInner = upsertPropertyInBlock(innerContent, key, newPropertyStr, false);
                    if (updatedInner !== "") {
                        newLines.push(`%%${updatedInner}%%`);
                    }
                    i = blockMatch.endIndex; // Skip the original block lines

                    // If we matched nextLineIndex + 1 (empty line in between), we should have pushed that empty line?
                    // Let's just keep it simple.
                    foundBlock = true;
                }

                if (!foundBlock) {
                    // Create new block
                    newLines.push(`%%\n${newPropertyStr}\n%%`);

                    // Add empty line if next line has content
                    if (i + 1 < lines.length && lines[i + 1].trim() !== "") {
                        newLines.push("");
                    }
                }
            } else {
                newLines.push(line);
            }
            i++;
        }

        return newLines.join("\n");
    });
};

export const renamePropertyInAllRecords = async (app: App, file: TFile, oldKey: string, newKey: string) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const newLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith("%%")) {
                const blockMatch = findCommentBlock(lines, i, lines.length);
                if (blockMatch) {
                    let innerContent = blockMatch.content.substring(2, blockMatch.content.length - 2).trim();

                    // Regex to find property [oldKey:: ...]
                    const propertyRegex = new RegExp(`\\[\\s*${escapeRegExp(oldKey)}\\s*::`, 'g');

                    if (propertyRegex.test(innerContent)) {
                        innerContent = innerContent.replace(propertyRegex, `[${newKey}::`);
                        newLines.push(`%%\n${innerContent}\n%%`);
                    } else {
                        newLines.push(blockMatch.content);
                    }
                    i = blockMatch.endIndex;

                    // Add empty line if next line has content
                    if (i + 1 < lines.length && lines[i + 1].trim() !== "") {
                        newLines.push("");
                    }
                } else {
                    newLines.push(line);
                }
            } else {
                newLines.push(line);
            }
        }

        return newLines.join("\n");
    });
};

export const deletePropertyFromAllRecords = async (app: App, file: TFile, key: string) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const newLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith("%%")) {
                const blockMatch = findCommentBlock(lines, i, lines.length);
                if (blockMatch) {
                    let innerContent = blockMatch.content.substring(2, blockMatch.content.length - 2).trim();

                    // Regex to find and remove property [key:: ...]
                    // Need to be careful about spacing
                    const propertyRegex = new RegExp(`\\[\\s*${escapeRegExp(key)}\\s*::\\s*.*?\\]`, 'g');

                    if (propertyRegex.test(innerContent)) {
                        innerContent = innerContent.replace(propertyRegex, "").trim();
                        // Clean up double spaces
                        innerContent = innerContent.replace(/\s\s+/g, " ");
                        // Remove empty lines
                        innerContent = innerContent.split("\\n").map(l => l.trim()).filter(l => l).join("\\n");

                        if (innerContent.length === 0) {
                            // Empty block? Remove it?
                            // If it's empty, we can remove the line entirely
                        } else {
                            newLines.push(`%%\n${innerContent}\n%%`);
                        }
                    } else {
                        newLines.push(blockMatch.content);
                    }
                    i = blockMatch.endIndex;

                    // Add empty line if next line has content
                    if (i + 1 < lines.length && lines[i + 1].trim() !== "") {
                        newLines.push("");
                    }
                } else {
                    newLines.push(line);
                }
            } else {
                newLines.push(line);
            }
        }

        return newLines.join("\n");
    });
};

export const updateContent = async (app: App, file: TFile, record: DatabaseRecord, newContent: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);

        let startLine = findRecordStart(lines, record);
        if (startLine === -1) return data;

        let endLine = findRecordEnd(lines, startLine, record);

        // Identify existing property block (%% ... %%)
        let propertyBlockLine = "";
        for (let i = startLine + 1; i < endLine; i++) {
            if (lines[i].trim().startsWith("%%")) {
                const blockMatch = findCommentBlock(lines, i, endLine);
                if (blockMatch) {
                    propertyBlockLine = blockMatch.content;
                }
                break;
            }
        }

        // Construct new record block
        // Header
        const header = lines[startLine];

        // Properties
        const propertiesBlock = propertyBlockLine;

        // New Content
        // Ensure new content is separated from properties
        let newRecordBlock = header;

        if (propertiesBlock) {
            newRecordBlock += "\n" + propertiesBlock;
        }

        if (newContent) {
            newRecordBlock += "\n\n" + newContent;
        }

        // Replace old block
        // We need to be careful to remove all old lines
        lines.splice(startLine, endLine - startLine, newRecordBlock);

        return lines.join("\n");
    });
};

export const renameRecord = async (app: App, file: TFile, oldName: string, newName: string, level: number = 1) => {
    await app.vault.process(file, (data) => {
        const prefix = "#".repeat(level + 1);
        return data.replace(prefix + " " + oldName, prefix + " " + newName);
    });
};

export const deleteRecord = async (app: App, file: TFile, record: DatabaseRecord) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);

        let startLine = findRecordStart(lines, record);

        if (record.lineStart >= 0 && record.lineStart < lines.length) {
            const heading = getRecordHeading(record);
            if (lines[record.lineStart].trim() === heading) {
                startLine = record.lineStart;
            }
        }

        if (startLine === -1) {
            new Notice(`Could not find record to delete: "${record.id}"`);
            return data;
        }

        let endLine = findRecordEnd(lines, startLine, record);

        lines.splice(startLine, endLine - startLine);
        return lines.join("\n");
    });
};

export const addRecord = async (app: App, file: TFile, title: string, initialProperties?: Record<string, any>, columnTypes?: Record<string, string>) => {
    await app.vault.process(file, (data) => {
        // Find all existing titles
        const existingTitles = new Set<string>();
        const lines = data.split(/\r?\n/);
        for (const line of lines) {
            const headingMatch = line.match(/^#{2,}\s+(.+)$/);
            if (headingMatch) {
                existingTitles.add(headingMatch[1].trim());
            }
        }

        let newTitle = title;
        let counter = 1;
        while (existingTitles.has(newTitle)) {
            newTitle = `${title} ${counter}`;
            counter++;
        }

        let prefix = "\n";
        if (data.length > 0) {
            if (data.endsWith("\n\n")) {
                prefix = "";
            } else if (data.endsWith("\n")) {
                prefix = "\n";
            } else {
                prefix = "\n\n";
            }
        } else {
            prefix = "";
        }

        // Construct properties block
        let propsBlock = "";
        if (initialProperties && Object.keys(initialProperties).length > 0) {
            const propsList: string[] = [];
            for (const [key, value] of Object.entries(initialProperties)) {
                let type = columnTypes?.[key] || "text";
                let valStr = "";

                if (value !== null && value !== undefined && value !== "") {
                    valStr = String(value);
                    if (type === "text") {
                        if (typeof value === "boolean") {
                            type = "boolean";
                        } else if (typeof value === "number") {
                            type = "number";
                        } else if (Array.isArray(value)) {
                            type = "multi";
                            valStr = value.join(",");
                        } else if (typeof value === "string" && (valStr.startsWith("http") || valStr.startsWith("www."))) {
                            type = "link";
                        }
                    } else if (type === "multi" && Array.isArray(value)) {
                        valStr = value.join(",");
                    }
                }

                if (value instanceof Date) {
                    type = "date";
                    valStr = value.toISOString().split('T')[0];
                }

                propsList.push(`[${key}::${type}(${valStr})]`);
            }
            propsBlock = `%%\n${propsList.join("\n")}\n%%`;
        }

        const newRecord = `${prefix}## ${newTitle}\n${propsBlock}\n`;
        return data + newRecord;
    });
};

export const addChildRecord = async (
    app: App,
    file: TFile,
    parentRecord: DatabaseRecord,
    childLevel: number,
    title: string,
    initialProperties?: Record<string, any>,
    columnTypes?: Record<string, string>
) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);

        const existingTitles = new Set<string>();
        for (const line of lines) {
            const match = line.match(/^#{2,}\s+(.+)$/);
            if (match) {
                existingTitles.add(match[1].trim());
            }
        }

        let newTitle = title;
        let counter = 1;
        while (existingTitles.has(newTitle)) {
            newTitle = `${title} ${counter}`;
            counter++;
        }

        let propsBlock = "";
        if (initialProperties && Object.keys(initialProperties).length > 0) {
            const propsList: string[] = [];
            for (const [key, value] of Object.entries(initialProperties)) {
                let type = "text";
                let valStr = "";

                if (value !== null && value !== undefined && value !== "") {
                    valStr = String(value);
                    if (typeof value === "boolean") {
                        type = "boolean";
                    } else if (typeof value === "number") {
                        type = "number";
                    } else if (Array.isArray(value)) {
                        type = "multi";
                        valStr = value.join(",");
                    } else if (typeof value === "string" && (valStr.startsWith("http") || valStr.startsWith("www."))) {
                        type = "link";
                    }
                }

                if (value instanceof Date) {
                    type = "date";
                    valStr = value.toISOString().split('T')[0];
                }

                propsList.push(`[${key}::${type}(${valStr})]`);
            }
            propsBlock = `%%\n${propsList.join("\n")}\n%%`;
        }

        const headingPrefix = "#".repeat(childLevel + 1);
        const newRecord = `\n${headingPrefix} ${newTitle}\n${propsBlock}\n`;

        let insertLine = parentRecord.lineEnd;

        for (let i = parentRecord.lineStart + 1; i < lines.length; i++) {
            const trimmed = lines[i].trimStart();
            const headingMatch = trimmed.match(/^(#{2,})\s/);
            if (headingMatch) {
                const hLevel = headingMatch[1].length;
                if (hLevel <= parentRecord.level + 1 && i > parentRecord.lineStart) {
                    insertLine = i;
                    break;
                }
            }
            if (i >= lines.length - 1) {
                insertLine = lines.length;
            }
        }

        lines.splice(insertLine, 0, newRecord);

        return lines.join("\n");
    });
};
export const updateTitle = async (app: App, file: TFile, newTitle: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        let inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            if (!inCodeBlock && lines[i].startsWith("# ")) {
                const currentH1 = lines[i].substring(2).trim();
                const parenIndex = currentH1.search(/[(（]/);
                if (parenIndex !== -1) {
                    const suffix = currentH1.substring(parenIndex);
                    lines[i] = "# " + newTitle + suffix;
                } else {
                    lines[i] = "# " + newTitle;
                }
            }
        }
        return lines.join("\n");
    });
};

export const updateConfig = async (app: App, file: TFile, key: string, value: string, viewName?: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);

        // Find Title H1
        let titleLineIndex = -1;
        let title = "";
        let inCodeBlock = false;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmedLine = lines[i].trimStart();
            if (!inCodeBlock && trimmedLine.startsWith("# ")) {
                if (titleLineIndex === -1) {
                    titleLineIndex = i;
                    title = trimmedLine.substring(2).trim();
                    break; // Only care about the main title
                }
            }
        }

        let targetLineIndex = -1; // The header line index after which we look for config
        let searchEndIndex = lines.length; // Limit for searching existing properties

        if (viewName && title) {
            // Find View Header
            let viewHeaderIndex = -1;

            // Reset code block tracking
            inCodeBlock = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith("```")) {
                    inCodeBlock = !inCodeBlock;
                }

                const trimmedLine = lines[i].trimStart();
                if (!inCodeBlock && trimmedLine.startsWith("# ")) {
                    const h1Content = trimmedLine.substring(2).trim();
                    let foundName = null;

                    if (h1Content.startsWith(title)) {
                        const remainder = h1Content.substring(title.length).trim();
                        if (remainder.startsWith("-")) {
                            foundName = remainder.substring(1).trim();
                        } else if (remainder.startsWith("(") && remainder.endsWith(")")) {
                            foundName = remainder.substring(1, remainder.length - 1).trim();
                        } else if (remainder.startsWith("（") && remainder.endsWith("）")) {
                            foundName = remainder.substring(1, remainder.length - 1).trim();
                        }
                    }

                    if (foundName === viewName) {
                        viewHeaderIndex = i;
                        break;
                    }
                }
            }

            if (viewHeaderIndex !== -1) {
                targetLineIndex = viewHeaderIndex;
                // Search limit is next H1 or H2
                inCodeBlock = false;
                for (let i = viewHeaderIndex + 1; i < lines.length; i++) {
                    if (lines[i].trim().startsWith("```")) {
                        inCodeBlock = !inCodeBlock;
                    }
                    const trimmed = lines[i].trimStart();
                    if (!inCodeBlock && (trimmed.startsWith("# ") || trimmed.startsWith("## "))) {
                        searchEndIndex = i;
                        break;
                    }
                }
            } else {
                // Create View Header
                // Insert before the first record (## ) or at end of file
                let insertAt = lines.length;
                for (let i = 0; i < lines.length; i++) {
                    const trimmed = lines[i].trim();
                    if (trimmed.startsWith("## ")) {
                        insertAt = i;
                        break;
                    }
                }

                // Add empty line before if needed
                if (insertAt > 0 && lines[insertAt - 1].trim() !== "") {
                    lines.splice(insertAt, 0, "");
                    insertAt++;
                }

                let viewHeader = `# ${title}(${viewName})`;
                // Smart formatting: if viewName starts with parens, assume user wants attached style
                if (viewName.startsWith("（") || viewName.startsWith("(")) {
                    viewHeader = `# ${title}${viewName}`;
                }

                lines.splice(insertAt, 0, viewHeader);

                // Now target is the new header line
                targetLineIndex = insertAt;
                searchEndIndex = targetLineIndex + 1;
            }
        } else {
            // Global Config (Default View)
            // Target is Title H1 (or top if none)
            targetLineIndex = titleLineIndex; // Can be -1

            // Search limit is first H2 or next H1 (start of next view)
            const startSearch = titleLineIndex !== -1 ? titleLineIndex + 1 : 0;
            inCodeBlock = false;
            for (let i = startSearch; i < lines.length; i++) {
                if (lines[i].trim().startsWith("```")) {
                    inCodeBlock = !inCodeBlock;
                }
                const trimmed = lines[i].trimStart();
                if (!inCodeBlock && (trimmed.startsWith("# ") || trimmed.startsWith("## "))) {
                    searchEndIndex = i;
                    break;
                }
            }
        }

        // Look for %% block between targetLineIndex and searchEndIndex
        let configBlockStartIndex = -1;
        let configBlockEndIndex = -1;
        let configBlockContent = "";
        const startSearch = targetLineIndex !== -1 ? targetLineIndex + 1 : 0;

        for (let i = startSearch; i < searchEndIndex; i++) {
            if (lines[i].trim().startsWith("%%")) {
                const blockMatch = findCommentBlock(lines, i, searchEndIndex);
                if (blockMatch) {
                    configBlockStartIndex = blockMatch.startIndex;
                    configBlockEndIndex = blockMatch.endIndex;
                    configBlockContent = blockMatch.content;
                }
                break;
            }
        }

        const newPropertyStr = `[${key}::${value}]`;

        if (configBlockStartIndex !== -1) {
            let inner = configBlockContent.trim().substring(2, configBlockContent.trim().length - 2).trim();
            inner = upsertPropertyInBlock(inner, key, newPropertyStr, true);
            if (inner.trim() === "") {
                lines.splice(configBlockStartIndex, configBlockEndIndex - configBlockStartIndex + 1);
            } else {
                lines.splice(configBlockStartIndex, configBlockEndIndex - configBlockStartIndex + 1, `%%${inner}%%`);
            }
        } else {
            // Create block
            // Insert after targetLineIndex
            const insertAt = targetLineIndex !== -1 ? targetLineIndex + 1 : 0;
            lines.splice(insertAt, 0, `%%\n${newPropertyStr}\n%%`);
            // Ensure newline after config block
            if (insertAt + 1 >= lines.length || lines[insertAt + 1].trim() !== "") {
                lines.splice(insertAt + 1, 0, "");
            }
        }

        return lines.join("\n");
    });
};

export const deleteView = async (app: App, file: TFile, viewName: string) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        let title = "";
        let titleLineIndex = -1;

        // Find file title
        let inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmed = lines[i].trimStart();
            if (!inCodeBlock && trimmed.startsWith("# ")) {
                title = trimmed.substring(2).trim();
                titleLineIndex = i;
                break;
            }
        }

        if (!title) return content;

        let viewStartIndex = -1;
        let viewEndIndex = -1;

        // Find view header: # Title(ViewName)
        inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmed = lines[i].trimStart();
            if (!inCodeBlock && trimmed.startsWith("# ")) {
                const h1Content = trimmed.substring(2).trim();
                if (h1Content.startsWith(title)) {
                    const remainder = h1Content.substring(title.length).trim();
                    let foundName = null;
                    if (remainder.startsWith("(") && remainder.endsWith(")")) {
                        foundName = remainder.substring(1, remainder.length - 1).trim();
                    } else if (remainder.startsWith("（") && remainder.endsWith("）")) {
                        foundName = remainder.substring(1, remainder.length - 1).trim();
                    }

                    if (foundName === viewName) {
                        viewStartIndex = i;
                        break;
                    }
                }
            }
        }

        if (viewStartIndex !== -1) {
            // Find end of view (next # or ##)
            viewEndIndex = lines.length;
            inCodeBlock = false;
            for (let i = viewStartIndex + 1; i < lines.length; i++) {
                if (lines[i].trim().startsWith("```")) {
                    inCodeBlock = !inCodeBlock;
                }
                const trimmed = lines[i].trimStart();
                if (!inCodeBlock && (trimmed.startsWith("# ") || trimmed.startsWith("## "))) {
                    viewEndIndex = i;
                    break;
                }
            }

            // Remove lines
            lines.splice(viewStartIndex, viewEndIndex - viewStartIndex);
        }

        return lines.join("\n");
    });
};

export const renameView = async (app: App, file: TFile, oldName: string, newName: string) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        let title = "";

        // Find file title
        let inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmed = lines[i].trimStart();
            if (!inCodeBlock && trimmed.startsWith("# ")) {
                title = trimmed.substring(2).trim();
                break;
            }
        }

        if (!title) return content;

        // Find view header and replace it
        inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmed = lines[i].trimStart();
            if (!inCodeBlock && trimmed.startsWith("# ")) {
                const h1Content = trimmed.substring(2).trim();
                if (h1Content.startsWith(title)) {
                    const remainder = h1Content.substring(title.length).trim();
                    let foundName = null;
                    if (remainder.startsWith("(") && remainder.endsWith(")")) {
                        foundName = remainder.substring(1, remainder.length - 1).trim();
                    } else if (remainder.startsWith("（") && remainder.endsWith("）")) {
                        foundName = remainder.substring(1, remainder.length - 1).trim();
                    }

                    if (foundName === oldName) {
                        // Replace line
                        lines[i] = `# ${title}(${newName})`;
                        break;
                    }
                }
            }
        }

        return lines.join("\n");
    });
};

export const reorderViews = async (app: App, file: TFile, viewNames: string[]) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        let title = "";

        // Find file title
        let inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmed = lines[i].trimStart();
            if (!inCodeBlock && trimmed.startsWith("# ")) {
                title = trimmed.substring(2).trim();
                break;
            }
        }

        if (!title) return content;

        // Extract all view blocks
        const viewBlocks: { name: string, lines: string[] }[] = [];
        const viewIndices: number[] = []; // To track where views were located to replace them

        let currentViewName: string | null = null;
        let currentViewLines: string[] = [];
        let currentViewStart = -1;

        inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmed = lines[i].trimStart();

            // Check for View Header
            if (!inCodeBlock && trimmed.startsWith("# ")) {
                const h1Content = trimmed.substring(2).trim();
                if (h1Content.startsWith(title)) {
                    const remainder = h1Content.substring(title.length).trim();
                    let foundName = null;
                    if (remainder.startsWith("(") && remainder.endsWith(")")) {
                        foundName = remainder.substring(1, remainder.length - 1).trim();
                    } else if (remainder.startsWith("（") && remainder.endsWith("）")) {
                        foundName = remainder.substring(1, remainder.length - 1).trim();
                    }

                    if (foundName) {
                        // End previous view if any
                        if (currentViewName) {
                            viewBlocks.push({ name: currentViewName, lines: [...currentViewLines] });
                        }

                        currentViewName = foundName;
                        currentViewLines = [lines[i]];
                        currentViewStart = i;
                        viewIndices.push(i);
                        continue;
                    }
                }
            }

            // If inside a view, collect lines until next view or record
            if (currentViewName) {
                if (!inCodeBlock && (trimmed.startsWith("## ") || (trimmed.startsWith("# ") && i !== currentViewStart))) {
                    // End of view block
                    viewBlocks.push({ name: currentViewName, lines: [...currentViewLines] });
                    currentViewName = null;
                    currentViewLines = [];
                    // Don't continue, reprocess this line
                    // Actually logic is tricky here because we loop linearly.
                    // The loop condition handles "next view". 
                    // But "## " (record) also ends a view.
                } else {
                    currentViewLines.push(lines[i]);
                }
            }
        }

        // Handle last view
        if (currentViewName) {
            viewBlocks.push({ name: currentViewName, lines: [...currentViewLines] });
        }

        // Remove all view blocks from lines
        // We need to be careful with indices shifting.
        // Easiest way: filter out all lines that belong to views, then insert them back in order?
        // But views might be scattered (unlikely but possible). 
        // Typically views are after H1 and before H2.

        // Better approach: 
        // 1. Identify all view blocks and their ranges.
        // 2. Sort ranges by start index.
        // 3. Construct new content: 
        //    - Keep content before first view.
        //    - Append views in `viewNames` order.
        //    - Keep content after last view (usually records).
        //    - What if views are interleaved with other stuff? (Unlikely for this plugin)
        //    - Assumption: Views are contiguous or we force them to be contiguous after the Title?

        // Let's stick to "Find and Extract" strategy.

        // Re-scan to capture ranges accurately
        const viewRanges: { name: string, start: number, end: number, content: string[] }[] = [];

        inCodeBlock = false;
        let scanStart = -1;
        let scanName: string | null = null;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }
            const trimmed = lines[i].trimStart();

            const isViewHeader = !inCodeBlock && trimmed.startsWith("# ") && trimmed.substring(2).trim().startsWith(title) && (trimmed.includes("(") || trimmed.includes("（"));
            const isRecord = !inCodeBlock && trimmed.startsWith("## ");

            if (isViewHeader) {
                const h1Content = trimmed.substring(2).trim();
                const remainder = h1Content.substring(title.length).trim();
                let foundName = null;
                if (remainder.startsWith("(") && remainder.endsWith(")")) {
                    foundName = remainder.substring(1, remainder.length - 1).trim();
                } else if (remainder.startsWith("（") && remainder.endsWith("）")) {
                    foundName = remainder.substring(1, remainder.length - 1).trim();
                }

                if (foundName) {
                    if (scanName) {
                        // Close previous
                        viewRanges.push({ name: scanName, start: scanStart, end: i, content: lines.slice(scanStart, i) });
                    }
                    scanName = foundName;
                    scanStart = i;
                }
            } else if (isRecord) {
                if (scanName) {
                    viewRanges.push({ name: scanName, start: scanStart, end: i, content: lines.slice(scanStart, i) });
                    scanName = null;
                }
            }
        }

        if (scanName) {
            viewRanges.push({ name: scanName, start: scanStart, end: lines.length, content: lines.slice(scanStart, lines.length) });
        }

        if (viewRanges.length === 0) return content;

        // Check if we found all views
        // Filter viewBlocks based on viewNames order
        const orderedBlocks: string[][] = [];
        const remainingBlocks: string[][] = [];

        const mappedRanges = new Map<string, string[]>();
        viewRanges.forEach(r => mappedRanges.set(r.name, r.content));

        viewNames.forEach(name => {
            if (mappedRanges.has(name)) {
                orderedBlocks.push(mappedRanges.get(name)!);
                mappedRanges.delete(name);
            }
        });

        // Append any remaining views (not in list)
        mappedRanges.forEach((content) => {
            remainingBlocks.push(content);
        });

        const allNewViewLines = [...orderedBlocks, ...remainingBlocks].flat();

        // Replace in original lines
        // We assume views are somewhat contiguous or we just replace the chunk from first view start to last view end?
        // If there's text between views, it will be lost if we do simple replacement.
        // But the parser ignores text between views unless it's a new view or record.
        // Let's assume a continuous block of views for safety, or replace individually?
        // Replacing individually is hard if order changes.

        // Strategy: 
        // 1. Remove all detected view ranges from lines (backwards to keep indices valid)
        // 2. Insert allNewViewLines at the position of the *first* view.

        if (viewRanges.length > 0) {
            const firstViewStart = viewRanges[0].start;

            // Remove backwards
            for (let i = viewRanges.length - 1; i >= 0; i--) {
                const range = viewRanges[i];
                lines.splice(range.start, range.end - range.start);
            }

            // Insert at firstViewStart
            // Adjust firstViewStart? No, lines above it haven't changed.
            // But if we removed multiple chunks, the insertion point is where the first chunk was.
            // Wait, if views are scattered, we effectively gather them together at the first view's location. This is actually good for cleanup.

            // However, we need to handle the case where we removed multiple disjoint ranges.
            // If ranges are disjoint (e.g. text in between), that text remains.
            // If we insert everything at firstViewStart, the text that was between view 1 and 2 will now be after all views.
            // This seems acceptable for this plugin's file structure.

            // Actually, `lines` is modified in place. 
            // If we delete range 2 (index 100-110), then range 1 (index 10-20) is unaffected.
            // If we delete range 1, indices shift.
            // So we MUST delete from end to start.

            // But we need to remember the insertion point (start of the first view in original file).
            // Since we delete everything else, the insertion point is `viewRanges[0].start`.

            // Correct logic:
            // 1. Sort viewRanges by start index (they should be already).
            // 2. Insertion point = viewRanges[0].start.
            // 3. Delete all ranges from right to left.
            // 4. Insert new lines at Insertion point.

            lines.splice(firstViewStart, 0, ...allNewViewLines);

            // Ensure spacing?
            // Existing lines likely have newlines.
        }

        return lines.join("\n");
    });
};

export const reorderRecords = async (app: App, file: TFile, fromIndex: number, toIndex: number) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        const recordStarts: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (isHeadingLine(lines[i])) {
                recordStarts.push(i);
            }
        }

        // Validate indices
        if (recordStarts.length === 0) {
            new Notice("No records found to reorder");
            return data;
        }

        if (fromIndex < 0 || fromIndex >= recordStarts.length ||
            toIndex < 0 || toIndex >= recordStarts.length ||
            fromIndex === toIndex) {
            new Notice(`Invalid reorder indices: ${fromIndex} -> ${toIndex} (Total: ${recordStarts.length})`);
            return data;
        }

        // Split content into blocks
        // Block 0: Preamble (everything before first record)
        // Block 1..N: Records

        const preamble = lines.slice(0, recordStarts[0]);
        const recordBlocks: string[][] = [];

        for (let i = 0; i < recordStarts.length; i++) {
            const start = recordStarts[i];
            const end = (i + 1 < recordStarts.length) ? recordStarts[i + 1] : lines.length;
            recordBlocks.push(lines.slice(start, end));
        }

        // Move the record block
        const [movedRecord] = recordBlocks.splice(fromIndex, 1);
        recordBlocks.splice(toIndex, 0, movedRecord);

        // Reassemble
        const finalLines = [...preamble, ...recordBlocks.reduce((acc, val) => acc.concat(val), [])];
        return finalLines.join("\n");
    });
};

export const moveRecord = async (
    app: App,
    file: TFile,
    sourceRecord: DatabaseRecord,
    targetRecord: DatabaseRecord,
    position: "before" | "after" | "child"
) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);

        const srcStart = findRecordStart(lines, sourceRecord);
        if (srcStart === -1) return data;
        const srcEnd = findRecordEnd(lines, srcStart, sourceRecord);

        const tgtStartOrig = findRecordStart(lines, targetRecord);
        if (tgtStartOrig === -1) return data;
        const tgtEndOrig = findRecordEnd(lines, tgtStartOrig, targetRecord);

        if (tgtStartOrig >= srcStart && tgtStartOrig < srcEnd) {
            return data;
        }

        const sourceBlock = lines.slice(srcStart, srcEnd);
        lines.splice(srcStart, srcEnd - srcStart);

        const removedCount = srcEnd - srcStart;

        let newLevel: number;
        if (position === "child") {
            newLevel = targetRecord.depth + 1;
        } else {
            newLevel = targetRecord.depth;
        }

        const sourceOldLevel = sourceRecord.level;
        const delta = newLevel - sourceOldLevel;

        for (let i = 0; i < sourceBlock.length; i++) {
            const headingMatch = sourceBlock[i].match(/^(#{2,6})\s(.+)$/);
            if (headingMatch) {
                const currentLevel = headingMatch[1].length;
                const adjustedLevel = Math.min(6, Math.max(2, currentLevel + delta));
                const adjustedPrefix = "#".repeat(adjustedLevel);
                sourceBlock[i] = adjustedPrefix + " " + headingMatch[2];
            }
        }

        const isTargetAfterSource = tgtStartOrig > srcStart;
        let adjustedTgtStart: number;
        let adjustedTgtEnd: number;
        if (isTargetAfterSource) {
            adjustedTgtStart = tgtStartOrig - removedCount;
            adjustedTgtEnd = tgtEndOrig - removedCount;
        } else {
            adjustedTgtStart = tgtStartOrig;
            adjustedTgtEnd = tgtEndOrig;
        }

        let insertAt: number;
        if (position === "before") {
            insertAt = adjustedTgtStart;
        } else if (position === "after") {
            insertAt = adjustedTgtEnd;
        } else {
            insertAt = adjustedTgtEnd;
        }

        lines.splice(insertAt, 0, ...sourceBlock);

        return lines.join("\n");
    });
};

export const updateRecordRaw = async (app: App, file: TFile, record: DatabaseRecord, newRecordBlock: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);

        let startLine = findRecordStart(lines, record);
        if (startLine === -1) return data;

        let endLine = findRecordEnd(lines, startLine, record);

        // Replace lines
        lines.splice(startLine, endLine - startLine, newRecordBlock);

        return lines.join("\n");
    });
};

export const HIDDEN_CSS_CLASS = "db-property-hidden";

export async function addCssClassToFiles(app: App, files: TFile[], cssClass: string) {
    for (const file of files) {
        await app.fileManager.processFrontMatter(file, (frontmatter) => {
            const classes = frontmatter["cssclasses"] || [];
            if (!Array.isArray(classes)) {
                // Handle case where cssclasses might be a single string
                if (typeof classes === 'string') {
                    if (classes !== cssClass) {
                        frontmatter["cssclasses"] = [classes, cssClass];
                    }
                } else {
                    frontmatter["cssclasses"] = [cssClass];
                }
            } else {
                if (!classes.includes(cssClass)) {
                    classes.push(cssClass);
                    frontmatter["cssclasses"] = classes;
                }
            }
        });
    }
}

export async function removeCssClassFromFiles(app: App, files: TFile[], cssClass: string) {
    for (const file of files) {
        await app.fileManager.processFrontMatter(file, (frontmatter) => {
            const classes = frontmatter["cssclasses"];
            if (!classes) return;

            if (Array.isArray(classes)) {
                const index = classes.indexOf(cssClass);
                if (index > -1) {
                    classes.splice(index, 1);
                    if (classes.length === 0) {
                        delete frontmatter["cssclasses"];
                    } else {
                        frontmatter["cssclasses"] = classes;
                    }
                }
            } else if (typeof classes === 'string') {
                if (classes === cssClass) {
                    delete frontmatter["cssclasses"];
                }
            }
        });
    }
}
