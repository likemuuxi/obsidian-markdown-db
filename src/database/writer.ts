import { App, TFile } from "obsidian";
import { DatabaseRecord } from "./parser";

export const updateProperty = async (
    app: App,
    file: TFile,
    record: DatabaseRecord,
    key: string,
    newValue: string
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

        // Find end of record
        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                endLine = i;
                break;
            }
        }

        const propertyRegex = new RegExp(`\\[${escapeRegExp(key)}::(.*?)\\]`, 'g');
        let firstMatchFound = false;
        const linesToRemove: number[] = [];

        for (let i = startLine; i < endLine; i++) {
            let line = lines[i];
            
            if (propertyRegex.test(line)) {
                // Replace matches
                const newLine = line.replace(propertyRegex, () => {
                    if (!firstMatchFound) {
                        firstMatchFound = true;
                        return `[${key}::${newValue}]`;
                    } else {
                        return "";
                    }
                });
                
                lines[i] = newLine;

                // If the line became empty (and we just removed a property), we might want to remove it.
                // However, be careful not to remove the line if it was the one we just updated!
                // If we updated it, it contains `[key::newValue]`, so it's not empty.
                // If we removed all occurrences (because first was found earlier), it might be empty.
                
                if (newLine.trim() === "") {
                    linesToRemove.push(i);
                }
            }
        }
        
        // Remove empty lines in reverse order
        for (let i = linesToRemove.length - 1; i >= 0; i--) {
            lines.splice(linesToRemove[i], 1);
        }

        if (!firstMatchFound) {
            // Insert after H2
            const newPropertyStr = `[${key}::${newValue}]`;
            lines.splice(startLine + 1, 0, newPropertyStr);
        }

        return lines.join("\n");
    });
};

export const reorderRecords = async (app: App, file: TFile, fromIndex: number, toIndex: number) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const recordRanges: {start: number, end: number}[] = [];
        
        let currentStart = -1;
        
        // Scan for records
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                if (currentStart !== -1) {
                    recordRanges.push({start: currentStart, end: i - 1});
                }
                currentStart = i;
            }
        }
        if (currentStart !== -1) {
            recordRanges.push({start: currentStart, end: lines.length - 1});
        }
        
        if (fromIndex < 0 || fromIndex >= recordRanges.length || toIndex < 0 || toIndex >= recordRanges.length) {
            return content;
        }

        // Extract blocks
        const records = recordRanges.map(r => lines.slice(r.start, r.end + 1).join("\n"));
        const preamble = recordRanges.length > 0 ? lines.slice(0, recordRanges[0].start).join("\n") : "";
        
        // Move
        const [movedRecord] = records.splice(fromIndex, 1);
        records.splice(toIndex, 0, movedRecord);
        
        // Reassemble
        const parts = [];
        // Only push preamble if it exists and is not empty (or if the first record started after line 0)
        if (recordRanges.length > 0 && recordRanges[0].start > 0) {
            parts.push(preamble);
        } else if (preamble.trim()) {
            // Edge case: maybe preamble is just comments/frontmatter but starts at 0?
            // If record starts at 0, preamble is empty.
            // If record starts at 5, preamble is lines 0-4.
            // logic above covers it.
        }
        
        parts.push(...records);
        
        return parts.join("\n");
    });
};

export const addPropertyToAllRecords = async (app: App, file: TFile, key: string, defaultValue: string) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const newLines: string[] = [];
        const propertyRegex = /\[(.*?)::(.*?)\]/;
        
        // We need to iterate and inject property into each record
        // A record starts with "## Title"
        // We want to add the new property after the last existing property of the record, 
        // or immediately after the header if no properties exist.
        
        let insideRecord = false;
        let lastPropertyLineIndex = -1;
        let recordStartIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith("## ")) {
                // If we were inside a record and haven't added the property yet (should be done during processing),
                // wait, we process record by record.
                
                // Better approach:
                // Scan the file. identify insertion points.
                // Or just rebuild the file line by line?
                // Rebuilding line by line is safer if we track state.
                
                // Actually, let's look at how we want to insert.
                // For every "## ", we enter a new record.
                // We should look for the end of the property block of this record.
                // The property block ends when we hit a non-property line (that is not empty? or just content?)
                // Or we can just append it to the top of the property list? Or bottom?
                // Usually bottom of property list.
                
                // Let's keep it simple: Insert after the header.
                // That ensures it's a property.
                // BUT, if we insert after header, and there are other properties, it's fine.
                // [New::Val]
                // [Old::Val]
                // works.
                
                // However, user might prefer it at the end of properties.
                // Let's try to find the last property line.
                
                // Let's simplify:
                // Just insert `[Key::Value]` immediately after `## Title`.
                // This is robust and easy.
                
                newLines.push(line);
                newLines.push(`[${key}::${defaultValue}]`);
            } else {
                newLines.push(line);
            }
        }
        
        return newLines.join("\n");
    });
};

export const renameRecord = async (app: App, file: TFile, oldTitle: string, newTitle: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        const titleLineIndex = lines.findIndex(l => l.trim() === `## ${oldTitle}`);
        if (titleLineIndex !== -1) {
            lines[titleLineIndex] = `## ${newTitle}`;
        }
        return lines.join("\n");
    });
};

export const addRecord = async (app: App, file: TFile) => {
    await app.vault.process(file, (data) => {
        return data + "\n\n## New Record\n";
    });
};

export const createRecord = async (app: App, file: TFile, title: string, properties: Record<string, string>, content: string) => {
    await app.vault.process(file, (data) => {
        let newRecord = `## ${title}\n`;
        
        // Add properties
        for (const [key, value] of Object.entries(properties)) {
            if (value && value.trim()) {
                newRecord += `[${key}::${value}]\n`;
            }
        }
        
        // Add content
        if (content && content.trim()) {
            newRecord += `\n${content}\n`;
        } else {
             newRecord += `\n`; // Ensure at least one newline after properties
        }
        
        // Append to file
        // Ensure separation from previous content
        if (!data.endsWith("\n\n")) {
             if (data.endsWith("\n")) {
                 newRecord = "\n" + newRecord;
             } else {
                 newRecord = "\n\n" + newRecord;
             }
        }
        
        return data + newRecord;
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

        // Identify property lines to preserve
        const propertyRegex = /\[.*::.*\]/;
        const propertyLines: string[] = [];
        
        // Collect existing property lines
        for (let i = startLine + 1; i < endLine; i++) {
            if (propertyRegex.test(lines[i])) {
                propertyLines.push(lines[i]);
            }
        }
        
        // Construct new record block
        // Header
        const header = lines[startLine];
        
        // Properties
        const propertiesBlock = propertyLines.length > 0 ? propertyLines.join("\n") : "";
        
        // New Content
        // Ensure new content is separated from properties if properties exist
        const contentBlock = newContent;
        
        let newBlock = header;
        if (propertiesBlock) {
             newBlock += "\n" + propertiesBlock;
        }
        if (contentBlock) {
            newBlock += "\n" + contentBlock;
        } else {
             // If no content, maybe just a newline if properties exist to be clean?
             // Or keep tight. Let's add one newline if properties exist and no content to separate next header?
             // No, usually "## Title\n[Prop::Val]\n\n## Next" is good.
             // If content is empty, just header + props.
             if (propertiesBlock) newBlock += "\n";
        }

        // Replace the range in lines
        // Note: this is a bit tricky with array splice if we are constructing a string block.
        // Easier to keep lines array.
        
        // Let's do it carefully with lines array modification
        
        // 1. Remove old lines from startLine+1 to endLine
        // 2. Insert new lines
        
        // Prepare new lines array segment
        const newLinesSegment: string[] = [];
        if (propertiesBlock) {
            newLinesSegment.push(...propertiesBlock.split("\n"));
        }
        if (contentBlock) {
            newLinesSegment.push(...contentBlock.split("\n"));
        } else if (propertiesBlock) {
             // Ensure at least one empty line after properties if no content?
             // Not strictly required but looks better.
             newLinesSegment.push("");
        }

        // Splice
        const deleteCount = endLine - (startLine + 1);
        lines.splice(startLine + 1, deleteCount, ...newLinesSegment);

        return lines.join("\n");
    });
};
export const deletePropertyFromAllRecords = async (app: App, file: TFile, key: string) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);
        const newLines: string[] = [];
        const propertyRegex = new RegExp(`^\\[${escapeRegExp(key)}::.*?\\]$`);
        const inlinePropertyRegex = new RegExp(`\\[${escapeRegExp(key)}::.*?\\]`, 'g');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // If the line is EXACTLY the property (common case for list of properties)
            if (propertyRegex.test(line.trim())) {
                // Skip this line (delete it)
                continue;
            }
            
            // If the line contains the property but also other things (inline)
            // Remove the property string
            if (line.includes(`[${key}::`)) {
                newLines.push(line.replace(inlinePropertyRegex, "").trim());
            } else {
                newLines.push(line);
            }
        }
        
        return newLines.join("\n");
    });
};

export const updateConfig = async (app: App, file: TFile, key: string, value: string) => {
    await app.vault.process(file, (data) => {
        // Handle db-columns value format: remove brackets if present to avoid regex issues with inline properties
        let processedValue = value;
        if (key === "db-columns" && value.startsWith("[") && value.endsWith("]")) {
            processedValue = value.substring(1, value.length - 1);
        }

        // Special handling for db-sort and db-filter: remove if empty array
        const shouldRemove = (key === "db-sort" || key === "db-filter") && value === "[]";

        const lines = data.split(/\r?\n/);
        
        // 1. Find H1 to determine insertion point
        let h1Index = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("# ")) {
                h1Index = i;
                break;
            }
        }
        
        // 2. Scan for existing property before the first record (H2)
        let recordStartIndex = lines.length;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                recordStartIndex = i;
                break;
            }
        }
        
        const propertyRegex = new RegExp(`\\[${escapeRegExp(key)}::(.*?)\\]`);
        let foundIndex = -1;
        
        for (let i = 0; i < recordStartIndex; i++) {
            if (propertyRegex.test(lines[i])) {
                foundIndex = i;
                break;
            }
        }
        
        if (foundIndex !== -1) {
            if (shouldRemove) {
                // Check if the line is just this property
                const line = lines[foundIndex].trim();
                const startRegex = new RegExp(`^\\[${escapeRegExp(key)}::`);
                
                if (startRegex.test(line) && line.endsWith("]")) {
                     // Remove the whole line
                     lines.splice(foundIndex, 1);
                } else {
                    // Inline property mixed with other text? Remove the property part.
                    // Use greedy regex for complex properties to capture everything until the last ']'
                    const greedyRegex = new RegExp(`\\[${escapeRegExp(key)}::(.*)\\]`);
                    lines[foundIndex] = lines[foundIndex].replace(greedyRegex, "").trim();
                    // If line becomes empty, remove it? 
                    if (lines[foundIndex] === "") {
                        lines.splice(foundIndex, 1);
                    }
                }
            } else {
                // Update Logic
                // Check if the line is just this property (ignoring whitespace and potential garbage tails like "]]")
                const line = lines[foundIndex].trim();
                // Regex to match start of property
                const startRegex = new RegExp(`^\\[${escapeRegExp(key)}::`);
                
                if (startRegex.test(line)) {
                    // If it starts with the property, we assume the whole line is meant to be this property.
                    // This aggressively cleans up any trailing garbage like "]]]" from previous bug.
                    lines[foundIndex] = `[${key}::${processedValue}]`;
                } else {
                    // Inline property mixed with other text? Use replace.
                    if (key === "db-filter" || key === "db-sort" || key === "db-column-styles") {
                         // Use greedy regex for complex properties to capture everything until the last ']'
                         const greedyRegex = new RegExp(`\\[${escapeRegExp(key)}::(.*)\\]`);
                         lines[foundIndex] = lines[foundIndex].replace(greedyRegex, `[${key}::${processedValue}]`);
                    } else {
                         lines[foundIndex] = lines[foundIndex].replace(propertyRegex, `[${key}::${processedValue}]`);
                    }
                }
            }
        } else {
            if (!shouldRemove) {
                // Insert new property
                // Priority: After H1 > Create H1 (if missing) > After Frontmatter > At Start
                
                if (h1Index !== -1) {
                    // H1 exists, insert after it
                    lines.splice(h1Index + 1, 0, `[${key}::${processedValue}]`);
                } else {
                    // H1 does not exist. Create it using filename.
                    const title = file.basename;
                    const h1Line = `# ${title}`;
                    
                    let insertIndex = 0;
                    
                    if (lines[0] && lines[0].trim() === "---") {
                        // Find end of frontmatter
                        for (let i = 1; i < lines.length; i++) {
                            if (lines[i].trim() === "---") {
                                insertIndex = i + 1;
                                break;
                            }
                        }
                    }
                    
                    lines.splice(insertIndex, 0, h1Line, `[${key}::${processedValue}]`);
                }
            }
        }
        
        return lines.join("\n");
    });
};

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export const updateRecordRaw = async (app: App, file: TFile, record: DatabaseRecord, newRawContent: string) => {
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

        if (startLine === -1) return data; // Record not found

        // Find end of record
        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                endLine = i;
                break;
            }
        }
        
        // Splice
        const newLines = newRawContent.split(/\r?\n/);
        
        lines.splice(startLine, endLine - startLine, ...newLines);
        
        return lines.join("\n");
    });
};

export const deleteRecord = async (app: App, file: TFile, record: DatabaseRecord) => {
    await app.vault.process(file, (content) => {
        const lines = content.split(/\r?\n/);

        // Parse finding lines again to be safe
        // Ideally we reuse lineStart/lineEnd if we trust them but file might have changed.
        // Let's re-scan for safety.

        let startLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === "## " + record.id) {
                startLine = i;
                break;
            }
        }

        if (startLine === -1) return content;

        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
                endLine = i;
                break;
            }
        }

        // Remove lines from startLine to endLine - 1
        lines.splice(startLine, endLine - startLine);

        return lines.join("\n");
    });
};

export const updateTitle = async (app: App, file: TFile, newTitle: string) => {
    await app.vault.process(file, (data) => {
        const lines = data.split(/\r?\n/);
        // Find H1
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("# ")) {
                lines[i] = "# " + newTitle;
                return lines.join("\n");
            }
        }
        // If no H1, insert after frontmatter or at top
        const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
        const match = data.match(frontmatterRegex);
        if (match) {
            // Insert after frontmatter
            const endOfFM = match[0].length;
            // Check if there is a newline after frontmatter
            if (data[endOfFM] === '\n') {
                return data.slice(0, endOfFM) + "\n# " + newTitle + data.slice(endOfFM);
            } else {
                 return data.slice(0, endOfFM) + "\n\n# " + newTitle + "\n" + data.slice(endOfFM);
            }
        } else {
            return "# " + newTitle + "\n\n" + data;
        }
    });
};

