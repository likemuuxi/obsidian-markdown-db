import { App, TFile, Notice } from "obsidian";
import { MarkdownDBSettings } from "../settings";
import { 
    StarredRepo, 
    GithubPRItem, 
    fetchGithubStars, 
    fetchGithubPRs, 
    formatStarToMarkdown, 
    formatPRToMarkdown,
    mergeMarkdownContent
} from "../utils/github-api";

export class GithubSyncService {
    app: App;
    settings: MarkdownDBSettings;

    constructor(app: App, settings: MarkdownDBSettings) {
        this.app = app;
        this.settings = settings;
    }

    async syncStars() {
        const { githubUsername, githubSyncStarsDb } = this.settings;
        let githubToken = "";
        if ((this.app as any).secretStorage) {
            githubToken = await (this.app as any).secretStorage.getSecret("db-github-token") || "";
        }

        if (!githubUsername) {
            new Notice("Github Auto-Sync skipped: Username not set.");
            return;
        }

        if (!githubSyncStarsDb) {
            // Silent fail or log if not configured
            console.log("Github Auto-Sync (Stars) skipped: Target DB not set.");
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(githubSyncStarsDb);
        if (!file || !(file instanceof TFile)) {
             new Notice("Github Auto-Sync (Stars) skipped: Target DB file not found.");
             return;
        }

        new Notice(`Starting Github Auto-Sync (Stars) for ${githubUsername}...`);

        try {
            const stars = await fetchGithubStars(githubUsername, githubToken);
            await this.processStars(stars, file);
        } catch (e) {
            console.error("Github Auto-Sync (Stars) failed:", e);
            new Notice("Github Auto-Sync (Stars) failed: " + e.message);
        }
    }

    async syncPRs() {
        const { githubUsername, githubSyncPrsDb } = this.settings;
        let githubToken = "";
        if ((this.app as any).secretStorage) {
            githubToken = await (this.app as any).secretStorage.getSecret("db-github-token") || "";
        }

        if (!githubUsername) return; 
        if (!githubSyncPrsDb) {
            console.log("Github Auto-Sync (PRs) skipped: Target DB not set.");
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(githubSyncPrsDb);
        if (!file || !(file instanceof TFile)) return;

        new Notice(`Starting Github Auto-Sync (PRs) for ${githubUsername}...`);

        try {
            const allPrs = await fetchGithubPRs(githubUsername, githubToken);
            const prs = allPrs.filter(pr => !(pr.state === 'closed' && !pr.pull_request?.merged_at));
            
            await this.processPRs(prs, file);
        } catch (e) {
            console.error("Github Auto-Sync (PRs) failed:", e);
            new Notice("Github Auto-Sync (PRs) failed: " + e.message);
        }
    }

    async processStars(stars: StarredRepo[], file: TFile) {
        const existingContent = await this.app.vault.read(file);
        
        const { newCount, newContentOnly } = mergeMarkdownContent(
            stars,
            formatStarToMarkdown,
            existingContent,
            'append-only'
        );

        if (newCount > 0 && newContentOnly) {
            await this.app.vault.process(file, (data) => {
                return data + "\n" + newContentOnly;
            });
            new Notice(`Github Auto-Sync: Added ${newCount} new stars.`);
        } else {
            console.log("Github Auto-Sync: No new stars found.");
        }
    }

    async processPRs(prs: GithubPRItem[], file: TFile) {
        const existingContent = await this.app.vault.read(file);
        
        const { newCount, newContentOnly } = mergeMarkdownContent(
            prs,
            formatPRToMarkdown,
            existingContent,
            'append-only'
        );

        if (newCount > 0 && newContentOnly) {
            await this.app.vault.process(file, (data) => {
                return data + "\n" + newContentOnly;
            });
            new Notice(`Github Auto-Sync: Added ${newCount} new PRs.`);
        } else {
            console.log("Github Auto-Sync: No new PRs found.");
        }
    }
}
