import { App, TFolder } from "obsidian";

export class FolderSuggest {
    app: App;
    inputEl: HTMLInputElement;
    containerEl: HTMLElement;
    
    constructor(app: App, inputEl: HTMLInputElement) {
        this.app = app;
        this.inputEl = inputEl;
        
        // Create container
        this.containerEl = document.createElement("div");
        this.containerEl.addClass("suggestion-container");
        this.containerEl.style.position = "absolute";
        this.containerEl.style.zIndex = "9999";
        this.containerEl.style.display = "none";
        this.containerEl.style.maxHeight = "200px";
        this.containerEl.style.overflowY = "auto";
        this.containerEl.style.backgroundColor = "var(--background-secondary)";
        this.containerEl.style.border = "1px solid var(--background-modifier-border)";
        this.containerEl.style.borderRadius = "4px";
        this.containerEl.style.boxShadow = "0 2px 8px var(--background-modifier-box-shadow)";
        
        document.body.appendChild(this.containerEl);
        
        inputEl.addEventListener("input", this.onInput.bind(this));
        inputEl.addEventListener("focus", this.onInput.bind(this));
        inputEl.addEventListener("blur", () => {
            // Delay hiding to allow click event to register
            setTimeout(() => {
                this.containerEl.style.display = "none";
            }, 200);
        });
    }

    onInput() {
        const val = this.inputEl.value.toLowerCase();
        const folders = this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder && f.path.toLowerCase().contains(val));
        
        // Sort: exact match first, then by length
        folders.sort((a, b) => {
            if (a.path.toLowerCase() === val) return -1;
            if (b.path.toLowerCase() === val) return 1;
            return a.path.length - b.path.length;
        });

        this.showSuggestions(folders);
    }

    showSuggestions(folders: TFolder[]) {
        this.containerEl.empty();
        if (folders.length === 0) {
            this.containerEl.style.display = "none";
            return;
        }

        const rect = this.inputEl.getBoundingClientRect();
        this.containerEl.style.top = (rect.bottom + 5) + "px";
        this.containerEl.style.left = rect.left + "px";
        this.containerEl.style.width = rect.width + "px";
        this.containerEl.style.display = "block";

        folders.slice(0, 20).forEach(folder => {
            const item = this.containerEl.createEl("div");
            item.setText(folder.path === "/" ? "/" : folder.path);
            item.style.padding = "5px 10px";
            item.style.cursor = "pointer";
            
            item.addEventListener("mouseenter", () => {
                item.style.backgroundColor = "var(--background-modifier-hover)";
            });
            item.addEventListener("mouseleave", () => {
                item.style.backgroundColor = "";
            });
            item.addEventListener("mousedown", (e) => {
                e.preventDefault(); // Prevent blur
                this.inputEl.value = folder.path;
                // Trigger input event so Obsidian Setting detects change
                this.inputEl.dispatchEvent(new Event("input"));
                // Close explicitly after update
                this.containerEl.style.display = "none";
            });
        });
    }

    destroy() {
        if (this.containerEl) {
            this.containerEl.remove();
        }
    }
}
