import { App, TFile } from "obsidian";
import { extractProperties } from "../database/utils";
import { HIDDEN_CSS_CLASS } from "../database/writer";
import { VALID_PROPERTY_TYPES } from "../database/schema";

const VALID_TYPE_RE = new RegExp(`^(${VALID_PROPERTY_TYPES.join("|")})\\s*\\(([\\s\\S]*)\\)$`, "i");

/** Strip a valid `type(value)` wrapper and return the display value. */
function displayValue(raw: string): string {
    const m = raw.match(VALID_TYPE_RE);
    return m ? m[2].trim() : raw;
}

/**
 * Remove `markdown-db` and the `db-property-hidden` cssclass from frontmatter.
 * Drops the whole frontmatter block when nothing remains.
 */
function cleanFrontmatter(lines: string[]): { lines: string[]; changed: boolean } {
    if (lines.length === 0 || lines[0].trim() !== "---") return { lines, changed: false };

    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") { end = i; break; }
    }
    if (end === -1) return { lines, changed: false };

    const inner = lines.slice(1, end);
    const kept: string[] = [];
    let changed = false;
    let cssKeyIndex = -1; // index in `kept` of a block-list-form "cssclasses:" key

    for (const line of inner) {
        const trimmed = line.trim();

        if (/^markdown-db\s*:/.test(trimmed)) {
            changed = true;
            continue;
        }

        const cssMatch = trimmed.match(/^cssclasses?\s*:\s*(.*)$/);
        if (cssMatch) {
            const rest = cssMatch[1].trim();
            if (rest.startsWith("[") && rest.endsWith("]")) {
                // Inline array form: cssclasses: [a, b]
                const items = rest.slice(1, rest.length - 1).split(",").map(s => s.trim()).filter(s => s.length > 0);
                const keptItems = items.filter(c => c !== HIDDEN_CSS_CLASS);
                if (keptItems.length !== items.length) {
                    changed = true;
                    if (keptItems.length > 0) {
                        const keyPart = line.substring(0, line.indexOf(":") + 1);
                        kept.push(`${keyPart} [${keptItems.join(", ")}]`);
                    }
                    continue;
                }
                kept.push(line);
                cssKeyIndex = -1;
                continue;
            }
            if (rest.length > 0) {
                // Single string value
                const bare = rest.replace(/^['"]|['"]$/g, "");
                if (bare === HIDDEN_CSS_CLASS) {
                    changed = true;
                    continue;
                }
                kept.push(line);
                cssKeyIndex = -1;
                continue;
            }
            // Block list form: cssclasses:
            cssKeyIndex = kept.length;
            kept.push(line);
            continue;
        }

        if (cssKeyIndex !== -1) {
            const item = trimmed.match(/^-\s+(.*)$/);
            if (item) {
                const value = item[1].trim().replace(/^['"]|['"]$/g, "");
                if (value === HIDDEN_CSS_CLASS) {
                    changed = true;
                    continue;
                }
                kept.push(line);
                continue;
            }
            // cssclasses list ended; drop the key if its list became empty
            if (kept.length === cssKeyIndex + 1) {
                kept.splice(cssKeyIndex, 1);
                changed = true;
            }
            cssKeyIndex = -1;
        }

        kept.push(line);
    }

    if (cssKeyIndex !== -1 && kept.length === cssKeyIndex + 1) {
        kept.splice(cssKeyIndex, 1);
        changed = true;
    }

    if (!changed) return { lines, changed: false };

    if (kept.length === 0) {
        return { lines: lines.slice(end + 1), changed: true };
    }
    return { lines: ["---", ...kept, "---", ...lines.slice(end + 1)], changed: true };
}

/**
 * Process %% property blocks:
 * - under H1 (or before any heading, i.e. db config): remove the block
 * - under H2+ headings: convert to an unordered list ("- key: value")
 */
function cleanBody(lines: string[]): { lines: string[]; changed: boolean } {
    const out: string[] = [];
    let changed = false;
    let inCodeBlock = false;
    let lastHeadingLevel = 0;

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("```")) {
            inCodeBlock = !inCodeBlock;
            out.push(line);
            i++;
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s/);
        if (headingMatch) {
            lastHeadingLevel = headingMatch[1].length;
            out.push(line);
            i++;
            continue;
        }

        if (!inCodeBlock && trimmed.startsWith("%%")) {
            const isSingleLine = trimmed.endsWith("%%") && trimmed.length >= 4;
            const blockLines: string[] = [line];
            i++;
            if (!isSingleLine) {
                let closed = false;
                while (i < lines.length) {
                    blockLines.push(lines[i]);
                    if (lines[i].trim().endsWith("%%")) { closed = true; i++; break; }
                    i++;
                }
                if (!closed) {
                    // Unterminated block: leave untouched
                    out.push(...blockLines);
                    continue;
                }
            }

            const props = extractProperties(blockLines.join("\n"));
            if (props.length === 0) {
                // Not a property block (plain comment): keep
                out.push(...blockLines);
                continue;
            }

            changed = true;

            if (lastHeadingLevel <= 1) {
                // Swallow one following blank line to avoid doubled blank lines
                if (i < lines.length && lines[i].trim() === "" && out.length > 0 && out[out.length - 1].trim() === "") {
                    i++;
                }
            } else {
                for (const prop of props) {
                    out.push(`- ${prop.key}: ${displayValue(prop.value)}`);
                }
            }
            continue;
        }

        out.push(line);
        i++;
    }

    return { lines: out, changed };
}

/** Clean Markdown DB specific formatting from a file. Returns true when the file was modified. */
export async function cleanDbFormat(app: App, file: TFile): Promise<boolean> {
    let changed = false;
    await app.vault.process(file, (content) => {
        const fm = cleanFrontmatter(content.split(/\r?\n/));
        const body = cleanBody(fm.lines);

        if (!fm.changed && !body.changed) return content;
        changed = true;
        return body.lines.join("\n");
    });
    return changed;
}
