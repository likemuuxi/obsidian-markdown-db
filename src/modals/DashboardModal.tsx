import { App, Modal } from "obsidian";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { Dashboard } from "../components/Dashboard";
import type MyPlugin from "../main";

export class DashboardModal extends Modal {
    root: ReactDOM.Root | null = null;
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Add class for styling
        modalEl.addClass("markdown-db-dashboard-modal");
        
        // Remove default padding/styles if needed to make it full width/height
        // We will style .markdown-db-dashboard-modal .modal-content in css

        const reactContainer = contentEl.createDiv({ cls: "markdown-db-dashboard-container" });
        this.root = ReactDOM.createRoot(reactContainer);
        
        this.root.render(
            <Dashboard 
                app={this.app} 
                plugin={this.plugin}
                onClose={() => this.close()} 
                portalContainer={this.modalEl}
            />
        );
    }

    onClose() {
        if (this.root) {
            this.root.unmount();
        }
        this.contentEl.empty();
    }
}
