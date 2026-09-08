import { App, FuzzySuggestModal, TFile } from "obsidian";
import MarkdownDBPlugin from "../main";
import { VIEW_TYPE_MARKDOWN_DB } from "../views/view";
import { t } from "../i18n";

export class DBSwitcherModal extends FuzzySuggestModal<TFile> {
    plugin: MarkdownDBPlugin;

    constructor(app: App, plugin: MarkdownDBPlugin) {
        super(app);
        this.plugin = plugin;
        this.setPlaceholder(t("modals.dbSwitcher.placeholder"));
    }

    getItems(): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            const cache = this.app.metadataCache.getFileCache(file);
            return cache?.frontmatter?.["markdown-db"] === true || cache?.frontmatter?.["markdown-db"] === "true";
        });
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
        const leaf = this.app.workspace.getLeaf(false);
        // Explicitly set view state to ensure it opens in DB view if needed,
        // though the monkeyPatchOpenFile in main.ts usually handles this.
        // We use leaf.openFile which triggers the patched logic.
        leaf.openFile(item);
    }
}
