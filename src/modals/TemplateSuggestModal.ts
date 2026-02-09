import { App, FuzzySuggestModal, TFile } from "obsidian";
import type MarkdownDBPlugin from "../main";

export class TemplateSuggestModal extends FuzzySuggestModal<TFile> {
    plugin: MarkdownDBPlugin;
    onSelect?: (file: TFile) => void;

    constructor(plugin: MarkdownDBPlugin, onSelect?: (file: TFile) => void) {
        super(plugin.app);
        this.plugin = plugin;
        this.onSelect = onSelect;
        this.setPlaceholder("Select a file to use as template");
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles().filter(f => ["md", "yaml", "yml"].includes(f.extension));
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    async onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): Promise<void> {
        if (!this.plugin.settings.templates.includes(item.path)) {
            this.plugin.settings.templates.push(item.path);
            await this.plugin.saveSettings();

            if (this.onSelect) {
                this.onSelect(item);
            }

            // Refresh view? The view should react to settings change if it subscribed?
            // Actually view.tsx explicitly passes settings. So we need to trigger refresh in active view.
            this.app.workspace.iterateAllLeaves(leaf => {
                if (leaf.view.getViewType() === "markdown-db-view") {
                    // @ts-ignore
                    if (leaf.view.refresh) leaf.view.refresh();
                }
            });
        }
    }
}
