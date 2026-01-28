import { App, TFile, Notice } from "obsidian";
import { TypedValue, formatTypedValue, parseTypedValue, DatabaseRecord } from "./schema";
import { extractProperties } from "./utils";

// Helper to escape regex special characters
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    
    return newProperties.join(" ");
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

        // Re-find record
        let startLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === "## " + record.id) { // match by ID (title)
                startLine = i;
                break;
            }
        }

        if (startLine === -1) return content;

        // Find end of record (next ## or end of file)
        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                endLine = i;
                break;
            }
        }

        // Look for %% block in the record
        let commentBlockIndex = -1;
        let commentBlockContent = "";
        
        for (let i = startLine + 1; i < endLine; i++) {
            const line = lines[i].trim();
            if (line.startsWith("%%") && line.endsWith("%%")) {
                commentBlockIndex = i;
                commentBlockContent = line;
                break;
            }
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

        if (commentBlockIndex !== -1) {
            // Update existing block
            let innerContent = commentBlockContent.substring(2, commentBlockContent.length - 2).trim();
            innerContent = upsertPropertyInBlock(innerContent, key, newPropertyStr, true);
            
            // If innerContent becomes empty after deletion, remove the line?
            // The user requested to remove [Category::] if empty.
            // If the whole block becomes empty (e.g. `%%  %%`), we could remove it.
            if (innerContent.trim() === "") {
                lines.splice(commentBlockIndex, 1);
            } else {
                lines[commentBlockIndex] = `%% ${innerContent} %%`;

                // Ensure empty line after if followed by content
                const nextLineIdx = commentBlockIndex + 1;
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
                    lines.splice(startLine + 1, 0, `%% ${newPropertyStr} %%`, "");
                } else {
                    lines.splice(startLine + 1, 0, `%% ${newPropertyStr} %%`);
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
            
            if (line.startsWith("## ")) {
                newLines.push(line);
                
                // Check if next line is already a comment block
                let nextLineIndex = i + 1;
                let foundBlock = false;
                
                // Peek next lines (skipping empty lines?)
                // Usually it's immediately after.
                if (nextLineIndex < lines.length && lines[nextLineIndex].trim().startsWith("%%") && lines[nextLineIndex].trim().endsWith("%%")) {
                    // Update existing block
                    let blockLine = lines[nextLineIndex];
                    let innerContent = blockLine.trim().substring(2, blockLine.trim().length - 2).trim();
                    
                    const updatedInner = upsertPropertyInBlock(innerContent, key, newPropertyStr, false);
                    newLines.push(`%% ${updatedInner} %%`);
                    
                    i++; // Skip the original block line
                    foundBlock = true;
                } 
                
                if (!foundBlock) {
                    // Create new block
                    newLines.push(`%% ${newPropertyStr} %%`);
                    
                    // Add empty line if next line has content
                    if (i + 1 < lines.length && lines[i+1].trim() !== "") {
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
            
            if (trimmed.startsWith("%%") && trimmed.endsWith("%%")) {
                let innerContent = trimmed.substring(2, trimmed.length - 2).trim();
                
                // Regex to find property [oldKey:: ...]
                const propertyRegex = new RegExp(`\\[\\s*${escapeRegExp(oldKey)}\\s*::`, 'g');
                
                if (propertyRegex.test(innerContent)) {
                    innerContent = innerContent.replace(propertyRegex, `[${newKey}::`);
                    newLines.push(`%% ${innerContent} %%`);
                } else {
                    newLines.push(line);
                }

                // Add empty line if next line has content
                if (i + 1 < lines.length && lines[i+1].trim() !== "") {
                    newLines.push("");
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
            
            if (trimmed.startsWith("%%") && trimmed.endsWith("%%")) {
                let innerContent = trimmed.substring(2, trimmed.length - 2).trim();
                
                // Regex to find and remove property [key:: ...]
                // Need to be careful about spacing
                const propertyRegex = new RegExp(`\\[\\s*${escapeRegExp(key)}\\s*::\\s*.*?\\]`, 'g');
                
                if (propertyRegex.test(innerContent)) {
                    innerContent = innerContent.replace(propertyRegex, "").trim();
                    // Clean up double spaces
                    innerContent = innerContent.replace(/\s\s+/g, " ");
                    
                    if (innerContent.length === 0) {
                        // Empty block? Remove it?
                        // If it's empty, we can remove the line entirely
                        continue;
                    } else {
                        newLines.push(`%% ${innerContent} %%`);
                    }
                } else {
                    newLines.push(line);
                }

                // Add empty line if next line has content
                if (i + 1 < lines.length && lines[i+1].trim() !== "") {
                    newLines.push("");
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
        
        // Re-find record
        let startLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === "## " + record.id) {
                startLine = i;
                break;
            }
        }

        if (startLine === -1) return data;

        // Find end of record
        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                endLine = i;
                break;
            }
        }

        // Identify existing property block (%% ... %%)
        let propertyBlockLine = "";
        for (let i = startLine + 1; i < endLine; i++) {
            if (lines[i].trim().startsWith("%%") && lines[i].trim().endsWith("%%")) {
                propertyBlockLine = lines[i];
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

export const renameRecord = async (app: App, file: TFile, oldName: string, newName: string) => {
    await app.vault.process(file, (data) => {
        return data.replace("## " + oldName, "## " + newName);
    });
};

export const deleteRecord = async (app: App, file: TFile, record: DatabaseRecord) => {
    // new Notice(`Deleting record: ${record.id}`);
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        
        let startLine = -1;

        // Strategy 1: Try exact line location from record (fast path & handles duplicates)
        // Check if the line at record.lineStart matches the record pattern
        if (record.lineStart >= 0 && record.lineStart < lines.length) {
            const line = lines[record.lineStart].trim();
            // Compare trimmed versions to handle whitespace inconsistencies
            // Especially for empty titles: "## " vs "##"
            const target = `## ${record.id}`.trim();
            const targetTitle = `## ${record.title}`.trim();
            
            // Allow matching "##" if record.id is empty
            if (line === target || line === targetTitle) {
                startLine = record.lineStart;
            }
        }
        
        // Strategy 2: Fallback to linear search
        if (startLine === -1) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const target = `## ${record.id}`.trim();
                const targetTitle = `## ${record.title}`.trim();
                
                if (line === target || line === targetTitle) {
                    startLine = i;
                    break;
                }
            }
        }

        if (startLine === -1) {
             new Notice(`Could not find record to delete: "${record.id}"`);
             return data;
        }

        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                endLine = i;
                break;
            }
        }

        lines.splice(startLine, endLine - startLine);
        return lines.join("\n");
    });
};

export const addRecord = async (app: App, file: TFile, title: string) => {
    await app.vault.process(file, (data) => {
        // Append to end
        // Format:
        // ## Title
        // %% %%
        // (empty content)
        
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
        
        const newRecord = `${prefix}## ${title}\n%%  %%\n`;
        return data + newRecord;
    });
};
export const updateTitle = async (app: App, file: TFile, newTitle: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        // Find H1
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("# ")) {
                lines[i] = "# " + newTitle;
                break;
            }
        }
        return lines.join("\n");
    });
};

export const updateConfig = async (app: App, file: TFile, key: string, value: string) => {
    await app.vault.process(file, (data) => {
        // Configs are now stored in %% ... %% at the top (before first ##)
        
        const lines = data.split(/\r?\n/);
        
        // Find H1
        let h1Index = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("# ")) {
                h1Index = i;
                break;
            }
        }
        
        // Find first H2
        let firstRecordIndex = lines.length;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                firstRecordIndex = i;
                break;
            }
        }
        
        // Look for %% block between H1 and firstRecordIndex
        let configBlockIndex = -1;
        for (let i = 0; i < firstRecordIndex; i++) {
            if (lines[i].trim().startsWith("%%") && lines[i].trim().endsWith("%%")) {
                configBlockIndex = i;
                break;
            }
        }
        
        const newPropertyStr = `[${key}::${value}]`;
        
        if (configBlockIndex !== -1) {
            let inner = lines[configBlockIndex].trim().substring(2, lines[configBlockIndex].trim().length - 2).trim();
            inner = upsertPropertyInBlock(inner, key, newPropertyStr, true);
            lines[configBlockIndex] = `%% ${inner} %%`;
        } else {
            // Create block
            // Insert after H1 if exists, else at 0
            const insertAt = h1Index !== -1 ? h1Index + 1 : 0;
            lines.splice(insertAt, 0, `%% ${newPropertyStr} %%`);
        }
        
        return lines.join("\n");
    });
};

export const reorderRecords = async (app: App, file: TFile, fromIndex: number, toIndex: number) => {
    // new Notice(`Moving record ${fromIndex} -> ${toIndex}`);
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        const recordStarts: number[] = [];
        
        // Identify where each record starts (lines starting with "## ")
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
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
            const end = (i + 1 < recordStarts.length) ? recordStarts[i+1] : lines.length;
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

export const updateRecordRaw = async (app: App, file: TFile, record: DatabaseRecord, newRecordBlock: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        
        let startLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === "## " + record.id) {
                startLine = i;
                break;
            }
        }

        if (startLine === -1) return data;

        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                endLine = i;
                break;
            }
        }

        // Replace lines
        lines.splice(startLine, endLine - startLine, newRecordBlock);
        
        return lines.join("\n");
    });
};

export const HIDDEN_CSS_CLASS = "markdown-db-hidden";

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
