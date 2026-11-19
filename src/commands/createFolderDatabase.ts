import { App, Notice, TFile, TFolder } from "obsidian";
import { t } from "../i18n";
import { VIEW_TYPE_MARKDOWN_DB } from "../views/view";

const FOLDER_NOTES_PLUGIN_ID = "folder-notes";

// Frontmatter keys that should not become DB properties
// (same exclusions as the folder import, plus the marker itself)
const IGNORED_FRONTMATTER_KEYS = new Set(["cssclasses", "foldernote", "position", "markdown-db"]);

/** Check whether the Folder Note plugin (folder-notes) is enabled. */
export function isFolderNotesPluginEnabled(app: App): boolean {
    return (app as any).plugins?.enabledPlugins?.has(FOLDER_NOTES_PLUGIN_ID) ?? false;
}

/** Infer a DB property type from a frontmatter value. */
function inferType(value: any): string {
    if (Array.isArray(value)) return "multi";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return "number";
    // YAML timestamps (e.g. "2026-11-06 16:13") may arrive as Date objects
    if (value instanceof Date) return "date";

    if (typeof value === "string") {
        // Check for Date (YYYY-MM-DD or ISO 8601)
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
        // Check for Link [[...]]
        if (/^\[\[.*\]\]$/.test(value)) return "link";
        return "text";
    }
    return "text";
}

/** Convert a cached frontmatter object into DB property lines. */
function frontmatterToProps(frontmatter: Record<string, any> | undefined): string[] {
    if (!frontmatter) return [];
    const parts: string[] = [];

    for (const key of Object.keys(frontmatter)) {
        if (IGNORED_FRONTMATTER_KEYS.has(key.toLowerCase())) continue;
        const val = frontmatter[key];
        if (val === undefined || val === null) continue;

        const type = inferType(val);
        let valStr: string;
        if (Array.isArray(val)) {
            valStr = val.join(",");
        } else if (val instanceof Date) {
            const pad = (n: number) => String(n).padStart(2, "0");
            valStr = `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}`;
        } else if (typeof val === "object") {
            valStr = JSON.stringify(val);
        } else {
            valStr = String(val);
        }
        parts.push(`[${key}::${type}(${valStr})]`);
    }
    return parts;
}

/** Append a record block (heading + property comment block + content) to the output lines. */
function writeRecord(lines: string[], level: number, title: string, propParts: string[], content?: string) {
    const prefix = "#".repeat(Math.min(level, 6));
    lines.push(`${prefix} ${title}`);
    if (propParts.length > 0) {
        lines.push("%%");
        lines.push(...propParts);
        lines.push("%%");
    }
    if (content) {
        lines.push("");
        lines.push(content);
    }
    lines.push("");
}

/** Build a wikilink to a file (rendered clickable in the DB Content column). */
function fileLink(path: string, displayName: string): string {
    // Markdown targets resolve without the .md extension
    const target = path.replace(/\.md$/, "");
    return `[[${target}|${displayName}]]`;
}

/** Append a record for a folder (using its folder note's frontmatter, if any), then its children. */
function writeFolderRecord(app: App, folder: TFolder, level: number, lines: string[], counter: { count: number }) {
    const notePath = `${folder.path}/${folder.name}.md`;
    const noteFile = app.vault.getAbstractFileByPath(notePath);
    const props = noteFile instanceof TFile
        ? frontmatterToProps(app.metadataCache.getFileCache(noteFile)?.frontmatter)
        : [];
    // Link the folder record to its folder note when one exists
    const link = noteFile instanceof TFile ? fileLink(notePath, folder.name) : undefined;

    writeRecord(lines, level, folder.name, props, link);
    counter.count++;
    writeChildren(app, folder, level + 1, lines, counter);
}

/** Append records for the files and subfolders of a folder, folders first. */
function writeChildren(app: App, folder: TFolder, level: number, lines: string[], counter: { count: number }) {
    const folders = folder.children.filter(
        (c): c is TFolder => c instanceof TFolder && !c.name.startsWith(".")
    );
    const files = folder.children.filter(
        (c): c is TFile => c instanceof TFile && !c.name.startsWith(".")
    );

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    for (const sub of folders) {
        writeFolderRecord(app, sub, level, lines, counter);
    }

    for (const file of files) {
        // Skip folder notes: a file named after its parent folder is represented
        // by the folder's own record (or the database itself).
        if (file.parent && file.basename === file.parent.name) continue;

        if (file.extension === "md") {
            const props = frontmatterToProps(app.metadataCache.getFileCache(file)?.frontmatter);
            writeRecord(lines, level, file.basename, props, fileLink(file.path, file.basename));
        } else {
            writeRecord(lines, level, file.name, [], fileLink(file.path, file.name));
        }
        counter.count++;
    }
}

/**
 * Create a folder note database (`<Folder>/<Folder>.md`, the folder-notes convention)
 * mirroring the folder's files and subfolders as hierarchical records,
 * with YAML frontmatter converted to DB properties.
 */
export async function createFolderDatabase(app: App, folder: TFolder): Promise<void> {
    if (folder.isRoot()) {
        new Notice(t("commands.folderDbRoot"));
        return;
    }

    const notePath = `${folder.path}/${folder.name}.md`;
    if (await app.vault.adapter.exists(notePath)) {
        new Notice(t("commands.folderDbExists", { path: notePath }));
        return;
    }

    try {
        const lines: string[] = [];
        const counter = { count: 0 };
        writeChildren(app, folder, 2, lines, counter);

        const content = `---\nmarkdown-db: true\n---\n\n# ${folder.name}\n\n${lines.join("\n")}\n`;
        const file = await app.vault.create(notePath, content);

        new Notice(t("commands.folderDbCreated", { path: notePath, count: counter.count }));

        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(file);
        await leaf.setViewState({
            type: VIEW_TYPE_MARKDOWN_DB,
            state: { file: file.path }
        });
    } catch (e) {
        console.error("Markdown DB: failed to create folder database", e);
        new Notice(t("commands.folderDbFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
}
