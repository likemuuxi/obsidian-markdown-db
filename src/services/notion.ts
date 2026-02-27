import { App, Notice, TFile } from "obsidian";
import { MarkdownDBSettings, NotionSyncConfig } from "../settings";
import { NotionAPI } from "../utils/notion-api";
import { DatabaseRecord } from "../database/schema";
import { updateProperty } from "../database/writer";
import { markdownToNotionBlocks, notionBlocksToMarkdown } from "../utils/markdown-notion-converter";

export class NotionSyncService {
    app: App;
    settings: MarkdownDBSettings;
    private dbTitleProps: Map<string, string> = new Map();
    public isSyncing: boolean = false;
    private onSyncStatusChange: ((isSyncing: boolean) => void) | null = null;
    private onSaveSettings: () => Promise<void>;

    constructor(app: App, settings: MarkdownDBSettings, onSaveSettings: () => Promise<void>) {
        this.app = app;
        this.settings = settings;
        this.onSaveSettings = onSaveSettings;
    }

    setSyncStatus(status: boolean) {
        this.isSyncing = status;
        if (this.onSyncStatusChange) {
            this.onSyncStatusChange(status);
        }
    }

    registerSyncStatusListener(callback: (isSyncing: boolean) => void) {
        this.onSyncStatusChange = callback;
    }

    getSyncConfigForFile(file: TFile): NotionSyncConfig | undefined {
        return this.settings.notionSyncConfigs.find(config => config.targetDbPath === file.path);
    }

    async getDatabaseTitleProperty(api: NotionAPI, databaseId: string): Promise<string> {
        if (this.dbTitleProps.has(databaseId)) {
            return this.dbTitleProps.get(databaseId)!;
        }

        try {
            const db = await api.getDatabase(databaseId);
            const props = db.properties;
            for (const key in props) {
                if (props[key].type === 'title') {
                    this.dbTitleProps.set(databaseId, key);
                    return key;
                }
            }
        } catch (e) {
            console.error("Failed to fetch database schema", e);
        }

        return "Name"; // Default fallback
    }

    async syncAll() {
        if (this.isSyncing) return;
        this.setSyncStatus(true);
        new Notice("Starting Notion Sync...");

        const configs = this.settings.notionSyncConfigs;
        if (configs.length === 0) {
            this.setSyncStatus(false);
            return;
        }

        try {
            for (const config of configs) {
                // Check if auto-sync is enabled for this config
                // strict check: only allow if pull (though settings UI enforces this, good to be safe)
                if (config.autoSyncOnStartup && config.syncDirection !== 'push') {
                    await this.syncDatabase(config);
                }
            }
            new Notice("Notion Sync Completed.");
        } catch (e) {
            console.error("Sync All Failed", e);
            new Notice("Notion Sync Failed.");
        } finally {
            this.setSyncStatus(false);
        }
    }

    async syncDatabase(config: NotionSyncConfig, forceFull: boolean = false) {
        const token = this.settings.notionApiKey;
        if (!token || !config.databaseId || !config.targetDbPath) {
            console.warn(`Skipping sync for ${config.name}: Missing token, DB ID, or target path.`);
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(config.targetDbPath);
        if (!file || !(file instanceof TFile)) {
            console.warn(`Skipping sync for ${config.name}: Target file not found.`);
            return;
        }

        const isIncremental = !forceFull && !!config.lastSyncTime;
        const msg = isIncremental ? `Syncing Notion Database (Incremental): ${config.name}...` : `Syncing Notion Database (Full): ${config.name}...`;
        new Notice(msg);

        // Capture time before request to ensure we don't miss updates happening during sync
        const syncStartTime = new Date().toISOString();

        try {
            const api = new NotionAPI(token);

            let filter: any = undefined;
            if (isIncremental) {
                filter = {
                    timestamp: "last_edited_time",
                    last_edited_time: {
                        after: config.lastSyncTime
                    }
                };
            }

            const results = await api.queryDatabase(config.databaseId, filter);

            if (results.length > 0) {
                await this.processResults(results, config, file);
                new Notice(`Synced ${config.name}: ${results.length} items processed.`);
            } else {
                if (isIncremental) {
                    // specific message for incremental with no changes
                    // console.log(`No changes for ${config.name}`);
                } else {
                    new Notice(`Synced ${config.name}: No items found.`);
                }
            }

            // Update lastSyncTime and save
            config.lastSyncTime = syncStartTime;
            if (this.onSaveSettings) {
                await this.onSaveSettings();
            }

        } catch (error) {
            console.error(`Failed to sync Notion DB ${config.name}:`, error);
            new Notice(`Sync failed for ${config.name}: ${error.message}`);
        }
    }

    async syncPage(pageUrl: string, config: NotionSyncConfig, file: TFile, record?: DatabaseRecord) {
        const pageId = this.extractPageIdFromUrl(pageUrl);
        if (!pageId) {
            new Notice("Could not extract Notion Page ID from URL.");
            return;
        }

        const token = this.settings.notionApiKey;
        if (!token) {
            new Notice("Missing Notion Token.");
            return;
        }

        const direction = config.syncDirection || 'push';

        try {
            const api = new NotionAPI(token);

            if (direction === 'push' && record) {
                // Push local changes to Notion
                const notionProps = this.mapRecordToNotionProperties(record, config);
                // Force unarchive if archived
                await api.updatePage(pageId, notionProps, { archived: false });
                await this.syncContentToNotion(record, pageId, api);
                new Notice("Synced to Notion (Push).");
            } else {
                // Pull Notion changes to local
                const page = await api.retrievePage(pageId);
                await this.updatePageInFile(page, config, file);
                new Notice("Synced 1 item from Notion (Pull).");
            }

        } catch (error) {
            console.error("Failed to sync page:", error);
            new Notice(`Sync failed: ${error.message}`);
        }
    }

    async syncByTitle(record: DatabaseRecord, config: NotionSyncConfig, file: TFile) {
        const token = this.settings.notionApiKey;
        if (!token) {
            new Notice("Missing Notion Token.");
            return;
        }

        const title = record.title;

        try {
            const api = new NotionAPI(token);

            // Get the correct title property name
            const titleProp = await this.getDatabaseTitleProperty(api, config.databaseId);

            // Query for the page with matching title
            const results = await api.queryDatabase(config.databaseId, {
                property: titleProp,
                title: {
                    equals: title
                }
            });

            if (results && results.length > 0) {
                // Sync the first match
                const page = results[0];
                const direction = config.syncDirection || 'push';

                if (direction === 'push') {
                    // Update properties first (Optional, usually we push content primarily, but let's push properties too if implemented)
                    // Current implementation of updatePageInFile is Pull-oriented for properties.
                    // For push, we should construct Notion properties from record and update Notion page.

                    // 1. Update Notion Properties
                    const notionProps = this.mapRecordToNotionProperties(record, config);
                    // Remove title from props as we are updating existing page and title matched
                    // But if title changed locally? syncByTitle uses record.title to find page.
                    // If record.title changed, we wouldn't find the page unless we track ID.
                    // Assuming title is key and stable for finding.

                    await api.updatePage(page.id, notionProps);

                    // 2. Push Content
                    await this.syncContentToNotion(record, page.id, api);
                    new Notice("Synced to Notion (Push).");

                } else {
                    // Pull
                    await this.updatePageInFile(page, config, file, record, true); // true = pull content
                    new Notice("Synced from Notion (Pull).");
                }

            } else {
                // If not found, create a new page in Notion (Only if Push?)
                // If Pull, and not found in Notion, we can't pull anything.
                // But usually syncByTitle is triggered from a local record.
                // So if it doesn't exist in Notion, we should probably create it regardless of direction?
                // Or if Pull, maybe we warn "Not found in Notion"?
                // Standard behavior for "Sync" button on a local item usually implies "Make it exist on the other side" or "Update me".

                // Let's assume if it doesn't exist, we create it (Push).
                // If strictly Pull, we should do nothing or warn.
                const direction = config.syncDirection || 'push';
                if (direction === 'push') {
                    await this.createPageInNotion(record, config, file);
                } else {
                    new Notice("Item not found in Notion. Cannot pull.");
                }
            }
        } catch (error) {
            console.error("Failed to sync by title:", error);
            new Notice(`Sync failed: ${error.message}`);
        }
    }

    async createPageInNotion(record: DatabaseRecord, config: NotionSyncConfig, file: TFile) {
        const token = this.settings.notionApiKey;
        if (!token) {
            new Notice("Missing Notion Token.");
            return;
        }

        try {
            const api = new NotionAPI(token);

            // Get the correct title property name
            const titleProp = await this.getDatabaseTitleProperty(api, config.databaseId);

            const notionProps = this.mapRecordToNotionProperties(record, config);

            // Add title
            notionProps[titleProp] = {
                title: [{ text: { content: record.title } }]
            };

            const response = await api.addItemToDatabase(config.databaseId, notionProps);
            const newUrl = response.url;
            const newPageId = response.id;

            // Update local file with new URL
            // Use "link" type which maps to link(url)
            await updateProperty(this.app, file, record, "notionUrl", newUrl, "link");

            // Check for content column with wikilink to sync content
            await this.syncContentToNotion(record, newPageId, api);

            new Notice("Created new page in Notion and linked.");
        } catch (error) {
            console.error("Failed to create page in Notion:", error);
            new Notice(`Failed to create page in Notion: ${error.message}`);
        }
    }

    async syncContentToNotion(record: DatabaseRecord, pageId: string, api: NotionAPI) {
        // Use record.content directly as it appears to be a top-level property
        let contentVal = record.content;

        // Fallback to properties['content'] if top-level content is empty
        if (!contentVal) {
            const contentVals = record.properties['content'];
            if (contentVals && contentVals.length > 0) {
                contentVal = String(contentVals[0].value);
            }
        }

        if (!contentVal) return;

        const linkMatch = String(contentVal).match(/\[\[(.*?)\]\]/);
        let blocks: any[] = [];

        if (linkMatch) {
            const linkText = linkMatch[1].split('|')[0]; // Handle alias
            const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, "");

            if (linkedFile && linkedFile instanceof TFile) {
                const content = await this.app.vault.read(linkedFile);
                blocks = markdownToNotionBlocks(content);
                new Notice(`Synced content from ${linkedFile.basename} to Notion.`);
            }
        } else if (contentVal) {
            // Treat as direct text content
            const textContent = String(contentVal);
            if (textContent.trim().length > 0) {
                // Convert markdown text to Notion blocks
                blocks = markdownToNotionBlocks(textContent);

                new Notice(`Synced direct text content to Notion.`);
            }
        }

        // Process local images requiring upload (Shared for both linked file and direct text)
        if (blocks.length > 0) {
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                if (block.type === 'local_image') {
                    // Handle upload
                    console.log("Found local image to upload:", block.image.path);
                    const imagePath = block.image.path;
                    const alt = block.image.alt;

                    // Resolve file
                    const file = this.app.metadataCache.getFirstLinkpathDest(imagePath, "");

                    if (file && file instanceof TFile) {
                        try {
                            const fileUpload = await this.uploadImageToNotion(file, api);
                            if (fileUpload && fileUpload.id) {
                                // Replace with actual image block
                                blocks[i] = {
                                    object: 'block',
                                    type: 'image',
                                    image: {
                                        type: 'file_upload',
                                        file_upload: {
                                            id: fileUpload.id
                                        },
                                        caption: alt ? [{ type: 'text', text: { content: alt } }] : []
                                    }
                                };
                            } else {
                                // Upload failed
                                blocks[i] = this.createPlaceholder(alt || imagePath, "Upload failed (no ID)");
                            }
                        } catch (error) {
                            console.error("Image upload failed:", error);
                            blocks[i] = this.createPlaceholder(alt || imagePath, `Upload failed: ${error.message}`);
                        }
                    } else {
                        blocks[i] = this.createPlaceholder(alt || imagePath, "File not found locally");
                    }
                }
            }
        }

        // Clear existing blocks first to avoid duplication
        try {
            const existing = await api.retrieveBlockChildren(pageId);
            if (existing && existing.results) {
                // Note: This might be slow for large pages and hit rate limits.
                // Ideally we should use a queue or parallel requests.
                for (const block of existing.results) {
                    try {
                        await api.deleteBlock(block.id);
                    } catch (err) {
                        console.warn(`Failed to delete block ${block.id}:`, err);
                    }
                }
            }
        } catch (e) {
            // If page is empty or 404, valid to ignore
        }

        if (blocks.length > 0) {
            await api.appendBlockChildren(pageId, blocks);
        }
    }

    createPlaceholder(text: string, subtext: string): any {
        return {
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [
                    { type: 'text', text: { content: `[${text || 'Image'}] ` } },
                    { type: 'text', text: { content: `(${subtext})` }, annotations: { color: 'gray', italic: true } }
                ]
            }
        };
    }

    async uploadImageToNotion(file: TFile, api: NotionAPI): Promise<any> {
        try {
            // Read file
            const arrayBuffer = await this.app.vault.readBinary(file);

            // content-type
            const ext = file.extension.toLowerCase();
            let contentType = "application/octet-stream";
            if (ext === "png") contentType = "image/png";
            else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
            else if (ext === "gif") contentType = "image/gif";
            else if (ext === "pdf") contentType = "application/pdf";

            // Step 1: Initiate
            new Notice(`Uploading image: ${file.name}...`);
            const initResponse = await api.initiateFileUpload(file.name, contentType);

            console.log("Initiate upload response:", initResponse);

            const fileUploadId = initResponse.id || initResponse.file_upload?.id;
            if (!fileUploadId) throw new Error("No file upload ID received from Notion.");

            // Construct upload URL if missing (Reference implementation pattern)
            let uploadUrl = initResponse.url || initResponse.upload_url || initResponse.signed_url;
            if (!uploadUrl) {
                // Fallback to constructing the send endpoint
                // As seen in reference code: https://api.notion.com/v1/file_uploads/${id}/send
                uploadUrl = `https://api.notion.com/v1/file_uploads/${encodeURIComponent(fileUploadId)}/send`;
            }

            // Step 2: Upload content via POST multipart/form-data
            await api.uploadFileContent(uploadUrl, arrayBuffer, contentType, file.name);

            new Notice(`Uploaded ${file.name}.`);
            return { id: fileUploadId };
        } catch (e) {
            console.error("Failed to upload image:", e);
            throw e;
        }
    }

    mapRecordToNotionProperties(record: DatabaseRecord, config: NotionSyncConfig): any {
        const props: any = {};

        for (const propConfig of config.properties) {
            let localValues = record.properties[propConfig.name];

            // Fallback: Case-insensitive search for local property
            if (!localValues) {
                const lowerName = propConfig.name.toLowerCase();
                const matchedKey = Object.keys(record.properties).find(k => k.toLowerCase() === lowerName);
                if (matchedKey) {
                    localValues = record.properties[matchedKey];
                }
            }

            if (!localValues || localValues.length === 0) continue;

            // Assuming single value for now, or taking the first one
            const valObj = localValues[0];
            const value = valObj.value;

            // Normalize type
            let type = propConfig.type.toLowerCase();
            if (type === 'multi-select') type = 'multi_select';

            // Simple mapping based on Notion type configured
            switch (type) {
                case "rich_text":
                case "text":
                    const textContent = String(value);
                    // Notion allows empty text, but usually we sync something. 
                    // If strictly empty, we can send it (clears property).
                    props[propConfig.name] = {
                        rich_text: [{ text: { content: textContent } }]
                    };
                    break;
                case "number":
                    props[propConfig.name] = {
                        number: Number(value)
                    };
                    break;
                case "select":
                    const selectName = String(value).trim();
                    if (!selectName) {
                        // If empty, maybe send null to clear? Or skip.
                        // Notion API: set to null to clear.
                        // For now, let's skip if empty string to avoid "name cannot be empty" error.
                        continue;
                    }
                    props[propConfig.name] = {
                        select: { name: selectName }
                    };
                    break;
                case "multi_select":
                    // Handle multiple values if available
                    const names = localValues.map(v => ({ name: String(v.value).trim() })).filter(n => n.name.length > 0);
                    if (names.length === 0) continue;
                    props[propConfig.name] = {
                        multi_select: names
                    };
                    break;
                case "checkbox":
                case "boolean":
                    props[propConfig.name] = {
                        checkbox: Boolean(value)
                    };
                    break;
                case "date":
                    // Notion date requires ISO string
                    const dateStr = String(value).trim();
                    if (!dateStr) continue;
                    props[propConfig.name] = {
                        date: { start: dateStr }
                    };
                    break;
                case "url":
                    const urlStr = String(value).trim();
                    if (!urlStr) continue;
                    props[propConfig.name] = {
                        url: urlStr
                    };
                    break;

                // Add more types as needed
            }
        }
        return props;
    }

    async syncContentFromNotion(wikilink: string, pageId: string, api: NotionAPI) {
        const linkMatch = wikilink.match(/\[\[(.*?)\]\]/);
        if (linkMatch) {
            const linkText = linkMatch[1].split('|')[0];
            const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, "");

            if (linkedFile && linkedFile instanceof TFile) {
                try {
                    const blocks = await api.retrieveBlockChildren(pageId);
                    if (blocks && blocks.results) {
                        const markdown = notionBlocksToMarkdown(blocks.results);
                        await this.app.vault.modify(linkedFile, markdown);
                        new Notice(`Synced content from Notion to ${linkedFile.basename}.`);
                    }
                } catch (e) {
                    console.error(`Failed to sync content for ${linkedFile.basename}`, e);
                }
            }
        }
    }

    extractPageIdFromUrl(url: string): string | null {
        const match = url.match(/([a-f0-9]{32})/);
        return match ? match[1] : null;
    }

    async updatePageInFile(page: any, config: NotionSyncConfig, file: TFile, record?: DatabaseRecord, pullContent: boolean = true) {
        const existingContent = await this.app.vault.read(file);
        const lines = existingContent.split('\n');

        const pageTitle = this.getTitleFromPage(page);
        const formatted = this.formatPageToMarkdown(page, config);
        const [newHeader, newMeta] = formatted.split('\n');
        let updated = false;

        // Find existing header with same title
        const headerSearch = `## ${pageTitle}`;
        let foundIdx = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === headerSearch) {
                foundIdx = i;
                break;
            }
        }

        if (foundIdx !== -1) {
            // Update Header (formatting consistency)
            if (lines[foundIdx] !== newHeader) {
                lines[foundIdx] = newHeader;
                updated = true;
            }

            // Find and Update Metadata (look for %% ... %% after header)
            let metaIdx = -1;
            for (let i = foundIdx + 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('%%')) {
                    metaIdx = i;
                    break;
                }
                if (line.startsWith('## ')) break; // Stop at next header
            }

            let contentWikilink = "";
            if (metaIdx !== -1) {
                // Extract existing content wikilink if not provided in record
                if (record) {
                    const contentVals = record.properties['content'];
                    if (contentVals && contentVals.length > 0) contentWikilink = String(contentVals[0].value);
                } else {
                    // Try to parse from existing line
                    const contentMatch = lines[metaIdx].match(/\[content::(.*?)\]/);
                    if (contentMatch) contentWikilink = contentMatch[1];
                }

                if (lines[metaIdx] !== newMeta) {
                    lines[metaIdx] = newMeta;
                    updated = true;
                }
            } else {
                // If no metadata line found, we could insert it, but that's risky for single-line updates in array
                // However, for single page update, inserting is fine as we write back immediately.
                lines.splice(foundIdx + 1, 0, newMeta);
                updated = true;
            }

            // Sync Content if linked
            if (contentWikilink && pullContent) {
                const token = this.settings.notionApiKey;
                if (token) {
                    const api = new NotionAPI(token);
                    await this.syncContentFromNotion(contentWikilink, page.id, api);
                }
            }

        } else {
            console.warn("Could not find line to update for Page Title:", pageTitle);
            // If called from syncPage, maybe we should append?
            // But this method is 'updatePageInFile'. 
            // If it's a sync of a single page that doesn't exist locally, we should probably append it.
            if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
                lines.push('');
            }
            lines.push(newHeader);
            lines.push(newMeta);
            lines.push('');
            updated = true;
        }

        if (updated) {
            await this.app.vault.modify(file, lines.join('\n'));
        }
    }

    async processResults(results: any[], config: NotionSyncConfig, file: TFile) {
        const existingContent = await this.app.vault.read(file);
        const lines = existingContent.split('\n');

        // Map Title -> Header Line Index
        const titleMap: Map<string, number> = new Map();
        lines.forEach((line, index) => {
            if (line.trim().startsWith('## ')) {
                const title = line.trim().substring(3).trim();
                if (!titleMap.has(title)) {
                    titleMap.set(title, index);
                }
            }
        });

        const newLines = [...lines];
        let appendedCount = 0;
        let updatedCount = 0;

        for (const page of results) {
            const pageTitle = this.getTitleFromPage(page);
            const formatted = this.formatPageToMarkdown(page, config);
            const [newHeader, newMeta] = formatted.split('\n');

            if (titleMap.has(pageTitle)) {
                // Update existing
                const headerIdx = titleMap.get(pageTitle)!;

                if (newLines[headerIdx] !== newHeader) {
                    newLines[headerIdx] = newHeader;
                    updatedCount++;
                }

                // Find Metadata line (search forward limited)
                let metaIdx = -1;
                for (let i = headerIdx + 1; i < newLines.length; i++) {
                    const line = newLines[i].trim();
                    if (line.startsWith('%%')) {
                        metaIdx = i;
                        break;
                    }
                    if (line.startsWith('## ')) break;
                }

                if (metaIdx !== -1) {
                    if (newLines[metaIdx] !== newMeta) {
                        newLines[metaIdx] = newMeta;
                        updatedCount++;
                    }
                } else {
                    // Metadata missing. Cannot safely insert in batch mode without tracking offsets.
                    // For now, skip or log.
                    // console.warn(`Skipping metadata update for ${pageTitle} (structure mismatch)`);
                }
            } else {
                // Append new
                if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
                    newLines.push('');
                }
                newLines.push(newHeader);
                newLines.push(newMeta);
                newLines.push('');
                appendedCount++;
            }
        }

        if (updatedCount > 0 || appendedCount > 0) {
            await this.app.vault.modify(file, newLines.join('\n'));
        }
    }

    getTitleFromPage(page: any): string {
        const props = page.properties;
        for (const key in props) {
            if (props[key].type === 'title') {
                const titleArr = props[key].title;
                if (titleArr && titleArr.length > 0) {
                    return titleArr.map((t: any) => t.plain_text).join('');
                }
                break;
            }
        }
        return "Untitled";
    }

    formatPageToMarkdown(page: any, config: NotionSyncConfig): string {
        // Format: 
        // ## Title
        // %% [sync::boolean(true)] [prop1::val1] ... [notionUrl::link(url)] %%

        const title = this.getTitleFromPage(page);
        const headerLine = `## ${title}`;
        const metaLines: string[] = [];

        const props = page.properties;

        config.properties.forEach(propConfig => {
            // Find property data (handle case sensitivity if needed, but Notion usually returns exact names)
            // But we should probably use the same logic as mapRecordToNotionProperties if we want robustness
            // For now, assume exact match or simple case check
            let propData = props[propConfig.name];

            if (!propData) {
                // Try finding key case-insensitively
                const lowerName = propConfig.name.toLowerCase();
                const matchedKey = Object.keys(props).find(k => k.toLowerCase() === lowerName);
                if (matchedKey) {
                    propData = props[matchedKey];
                }
            }

            if (!propData) return;

            const val = this.extractPropertyValue(propData);
            if (val !== null && val !== '') {
                metaLines.push(`[${propConfig.name}::${val}]`);
            }
        });

        // Add notionUrl
        if (page.url) {
            metaLines.push(`[notionUrl::link(${page.url})]`);
        }

        const metaLine = `%%\n${metaLines.join('\n')}\n%%`;

        return `${headerLine}\n${metaLine}`;
    }

    extractPropertyValue(prop: any): string | null {
        if (!prop) return null;

        switch (prop.type) {
            case 'rich_text':
            case 'title':
                return prop[prop.type].map((t: any) => t.plain_text).join('');
            case 'number':
                return prop.number;
            case 'select':
                return prop.select ? `select(${prop.select.name})` : null;
            case 'multi_select':
                return prop.multi_select ? `multi(${prop.multi_select.map((s: any) => s.name).join(', ')})` : null;
            case 'date':
                if (!prop.date) return null;
                return `date(${prop.date.start})`;
            case 'checkbox':
                return prop.checkbox ? 'boolean(true)' : 'boolean(false)';
            case 'url':
                return prop.url ? `link(${prop.url})` : null;
            case 'files':
                // Files are tricky as links expire. Just sync name or skip?
                // For now, skip or just say "file"
                return prop.files.length > 0 ? "file" : null;
            default:
                return null;
        }
    }
}
