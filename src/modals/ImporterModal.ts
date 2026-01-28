import { App, FuzzySuggestModal, TFolder, TFile, Notice } from "obsidian";
import { FileNameModal } from "./FileNameModal";

export class ImporterModal extends FuzzySuggestModal<TFolder> {
    dataType: string;

    constructor(app: App, dataType: string) {
        super(app);
        this.dataType = dataType;
    }

    getItems(): TFolder[] {
        return this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder);
    }

    getItemText(item: TFolder): string {
        return item.path === "/" ? "/" : item.path;
    }

    onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent): void {
        new FileNameModal(this.app, async (name) => {
            if (!name) {
                new Notice("Database name is required.");
                return;
            }
            try {
                await this.createDatabase(item, name);
                new Notice(`Database "${name}" created successfully!`);
            } catch (error) {
                console.error(error);
                new Notice("Failed to create database: " + error.message);
            }
        }).open();
    }

    inferType(value: any): string {
        if (Array.isArray(value)) return "multi";
        if (typeof value === "boolean") return "boolean";
        if (typeof value === "number") return "number";

        if (typeof value === "string") {
            // Check for Date (YYYY-MM-DD or ISO 8601)
            // Simple regex for YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
            
            // Check for Link [[...]]
            if (/^\[\[.*\]\]$/.test(value)) return "link";

            // Default to text
            return "text";
        }

        return "text";
    }

    async createDatabase(folder: TFolder, name: string) {
        const files = folder.children.filter((f): f is TFile => f instanceof TFile && f.extension === "md");
        
        let content = `---\nmarkdown-db: true\n---\n\n# ${name}\n\n`;

        // Ignored columns (lowercase for comparison)
        const ignoredColumns = new Set(["cssclasses", "foldernote", "position"]);

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            const fileContent = await this.app.vault.read(file);

            content += `## ${file.basename}\n`;
            
            const propsParts: string[] = [];
            
            if (frontmatter) {
                const keys = Object.keys(frontmatter).filter(k => !ignoredColumns.has(k.toLowerCase()));
                
                for (const key of keys) {
                    let val = frontmatter[key];
                    if (val === undefined || val === null) continue;
                    
                    const dbType = this.inferType(val);

                    // Format value
                    let valStr = "";
                    if (Array.isArray(val)) {
                        valStr = val.join(",");
                    } else if (typeof val === 'object') {
                        valStr = JSON.stringify(val);
                    } else {
                        valStr = String(val);
                    }
                    
                    // Special handling for boolean to ensure "true"/"false" string
                    if (dbType === "boolean") {
                         valStr = String(val); 
                    }

                    propsParts.push(`[${key}::${dbType}(${valStr})]`);
                }
            }
            
            if (propsParts.length > 0) {
                content += `%% ${propsParts.join(" ")} %%\n\n`;
            } else {
                content += `\n`; // Ensure newline if no props
            }

            // Process Body Content
            // Strip frontmatter
            const mainContent = fileContent.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
            
            if (mainContent) {
                // Shift headers: # -> ###, ## -> ####
                const shiftedContent = mainContent.replace(/^(#+)/gm, "##$1");
                content += shiftedContent + "\n\n";
            } else {
                content += "\n";
            }
        }

        const newFilePath = `${name}.md`; 
        await this.app.vault.create(newFilePath, content);
    }
}
