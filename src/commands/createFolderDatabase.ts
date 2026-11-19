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

/** Whether a file is a folder database (folder-note naming + markdown-db marker). */
export function isFolderDatabase(app: App, file: TFile): boolean {
    if (!file.parent || file.parent.isRoot()) return false;
    if (file.basename !== file.parent.name) return false;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.["markdown-db"] === true || fm?.["markdown-db"] === "true";
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

/** Append a record block (heading + property comment block) to the output lines. */
function writeRecord(lines: string[], level: number, title: string, propParts: string[]) {
    const prefix = "#".repeat(Math.min(level, 6));
    lines.push(`${prefix} ${title}`);
    if (propParts.length > 0) {
        lines.push("%%");
        lines.push(...propParts);
        lines.push("%%");
    }
    lines.push("");
}

/** Append a record for a folder (using its folder note's frontmatter, if any), then its children. */
function writeFolderRecord(app: App, folder: TFolder, level: number, lines: string[], counter: { count: number }) {
    const notePath = `${folder.path}/${folder.name}.md`;
    const noteFile = app.vault.getAbstractFileByPath(notePath);
    const props = noteFile instanceof TFile
        ? frontmatterToProps(app.metadataCache.getFileCache(noteFile)?.frontmatter)
        : [];
    writeRecord(lines, level, folder.name, props);
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
            writeRecord(lines, level, file.basename, props);
        } else {
            writeRecord(lines, level, file.name, []);
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

/**
 * Re-sync a folder database with its folder's current state: regenerate the
 * record blocks (H2-H6) from the folder while keeping the frontmatter, the
 * H1 title and any view header/config blocks (`# Title(View)` + `%%` blocks
 * outside records). Records are a mirror of the folder, so manual edits to
 * record blocks are overwritten.
 */
export async function syncFolderDatabase(app: App, dbFile: TFile): Promise<void> {
    const folder = dbFile.parent;
    if (!folder) return;

    const content = await app.vault.read(dbFile);
    const lines = content.split(/\r?\n/);

    const recordLines: string[] = [];
    const counter = { count: 0 };
    writeChildren(app, folder, 2, recordLines, counter);

    const kept: string[] = [];
    let insertAt = -1; // where the first record block used to live
    let inFrontmatter = false;
    let inRecord = false;
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        if (i === 0 && trimmed === "---") {
            inFrontmatter = true;
            kept.push(line);
            continue;
        }
        if (inFrontmatter) {
            kept.push(line);
            if (trimmed === "---") inFrontmatter = false;
            continue;
        }
        if (trimmed.startsWith("```")) {
            inCodeBlock = !inCodeBlock;
        }
        if (!inCodeBlock) {
            const heading = trimmed.match(/^(#{1,6})\s/);
            if (heading) {
                if (heading[1].length === 1) {
                    inRecord = false; // title / view header: keep
                } else {
                    if (insertAt === -1) insertAt = kept.length;
                    inRecord = true; // record block: drop
                    continue;
                }
            }
        }
        if (inRecord) continue; // record body: drop
        kept.push(line);
    }

    if (insertAt === -1) insertAt = kept.length;

    const newContent = [...kept.slice(0, insertAt), ...recordLines, ...kept.slice(insertAt)].join("\n");
    // Compare ignoring trailing whitespace so unchanged folders don't trigger writes
    const normalize = (s: string) => s.replace(/\s+$/, "");
    if (normalize(newContent) !== normalize(content)) {
        await app.vault.modify(dbFile, newContent);
    }
}
