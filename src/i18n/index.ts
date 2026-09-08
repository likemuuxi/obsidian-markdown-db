import { moment } from "obsidian";
import { en, Translations } from "./en";
import { zh } from "./zh";

const dictionaries: Record<string, Translations> = { en, zh };

/** Resolve the Obsidian UI language to an available dictionary. */
function detectLanguage(): string {
    let locale = "en";
    try {
        locale = (window.moment?.locale?.() ?? moment.locale?.() ?? "en").toLowerCase();
    } catch {
        locale = "en";
    }
    if (locale.startsWith("zh")) return "zh";
    return "en";
}

let currentLang = detectLanguage();

function lookup(dict: unknown, path: string): string | undefined {
    const value = path.split(".").reduce<unknown>((acc, part) => {
        if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[part];
        }
        return undefined;
    }, dict);
    return typeof value === "string" ? value : undefined;
}

/**
 * Translate a key using the current Obsidian language.
 * Falls back to English, then to the key itself.
 * Supports `{param}` interpolation, e.g. t("common.renamedTo", { name }).
 */
export function t(key: string, params?: Record<string, string | number>): string {
    let text = lookup(dictionaries[currentLang], key) ?? lookup(dictionaries.en, key);
    if (text === undefined) return key;
    if (params) {
        for (const [name, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
        }
    }
    return text;
}

export function getI18nLanguage(): string {
    return currentLang;
}
