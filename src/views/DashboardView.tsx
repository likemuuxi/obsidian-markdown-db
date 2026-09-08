import { ItemView, WorkspaceLeaf, Component } from "obsidian";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { Dashboard } from "../components/Dashboard";
import type MarkdownDBPlugin from "../main";
import { t } from "../i18n";

export const VIEW_TYPE_DASHBOARD = "markdown-db-dashboard-view";

export class DashboardView extends ItemView {
    root: ReactDOM.Root | null = null;
    plugin: MarkdownDBPlugin;
    component: Component;

    constructor(leaf: WorkspaceLeaf, plugin: MarkdownDBPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.component = new Component();
    }

    getViewType() {
        return VIEW_TYPE_DASHBOARD;
    }

    getDisplayText() {
        return t("dashboard.viewTitle");
    }

    getIcon() {
        return "table-properties";
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.component.load();

        contentEl.addClass("markdown-db-dashboard-view-host");

        const reactContainer = contentEl.createDiv({ cls: "markdown-db-dashboard-container" });
        this.root = ReactDOM.createRoot(reactContainer);

        this.renderDashboard();
    }

    private renderDashboard() {
        if (!this.root) return;
        this.root.render(
            <Dashboard
                app={this.app}
                plugin={this.plugin}
                onClose={() => {
                    // In a tab view, "close" just hides the dashboard section
                    // by selecting another leaf; nothing to do here.
                }}
                // Use document.body so position:fixed popovers anchor to the viewport.
                // The workspace leaf ancestors have CSS transforms (tab animations),
                // which would otherwise make fixed positioning offset incorrectly.
                portalContainer={document.body}
                component={this.component}
            />
        );
    }

    async onClose() {
        if (this.root) {
            this.root.unmount();
        }
        this.component.unload();
        this.contentEl.empty();
    }
}
