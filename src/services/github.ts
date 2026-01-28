import { App, requestUrl, RequestUrlParam, TFile, Notice } from "obsidian";
import { MarkdownDBSettings } from "../settings";

export interface StarredRepo {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    description: string;
    stargazers_count: number;
    language: string;
    topics: string[];
    created_at: string;
    updated_at: string;
    owner: {
        login: string;
        html_url: string;
    };
}

export class GithubSyncService {
    app: App;
    settings: MarkdownDBSettings;

    constructor(app: App, settings: MarkdownDBSettings) {
        this.app = app;
        this.settings = settings;
    }

    async syncStars() {
        const { githubUsername, githubToken, githubSyncTargetDb } = this.settings;

        if (!githubUsername) {
            new Notice("Github Auto-Sync skipped: Username not set.");
            return;
        }

        if (!githubSyncTargetDb) {
            // Silent fail or log if not configured, as user might not want it yet
            console.log("Github Auto-Sync skipped: Target DB not set.");
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(githubSyncTargetDb);
        if (!file || !(file instanceof TFile)) {
             new Notice("Github Auto-Sync skipped: Target DB file not found.");
             return;
        }

        new Notice(`Starting Github Auto-Sync for ${githubUsername}...`);

        try {
            const stars = await this.fetchAllStars(githubUsername, githubToken);
            await this.processStars(stars, file);
        } catch (e) {
            console.error("Github Auto-Sync failed:", e);
            new Notice("Github Auto-Sync failed: " + e.message);
        }
    }

    async fetchAllStars(username: string, token: string): Promise<StarredRepo[]> {
        let page = 1;
        const perPage = 100;
        let allStars: StarredRepo[] = [];
        let hasMore = true;

        while (hasMore) {
            const url = `https://api.github.com/users/${username}/starred?per_page=${perPage}&page=${page}&sort=created&direction=desc`;
            const params: RequestUrlParam = {
                url: url,
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Obsidian-Markdown-DB-Plugin'
                }
            };

            if (token) {
                params.headers['Authorization'] = `token ${token}`;
            }

            try {
                const response = await requestUrl(params);
                
                if (response.status >= 400) {
                     throw new Error(`HTTP ${response.status}: ${response.text}`);
                }

                const stars = response.json as StarredRepo[];
                if (stars.length === 0) {
                    hasMore = false;
                } else {
                    allStars = allStars.concat(stars);
                    if (stars.length < perPage) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch page " + page, e);
                throw e;
            }
        }
        return allStars;
    }

    async processStars(stars: StarredRepo[], file: TFile) {
        const existingContent = await this.app.vault.read(file);
        let contentToAppend = "";
        let skippedCount = 0;
        let newCount = 0;

        for (const repo of stars) {
             const title = repo.name.replace(/[\\/:*?"<>|]/g, "-");
             
             // Deduplication: check if Title (Name) already exists in content
             // Regex matches "## Title" at start of line
             const titleRegex = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
             if (existingContent && titleRegex.test(existingContent)) {
                 skippedCount++;
                 continue;
             }

             // Map fields
             const aliases = `[aliases::multi(${repo.name})]`; 
             const starsCount = `[stars::number(${repo.stargazers_count})]`;
             const url = `[url::link(${repo.html_url})]`;
             const owner = `[owner::link(${repo.owner.html_url})]`;
             const language = `[language::text(${repo.language || ""})]`;
             const description = `[description::text(${(repo.description || "").replace(/\n/g, " ").replace(/"/g, '\\"')})]`;
             
             const createdDate = new Date(repo.created_at);
             const createdFormatted = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`;
             const modifiedDate = new Date(repo.updated_at);
             const modifiedFormatted = `${modifiedDate.getFullYear()}-${String(modifiedDate.getMonth() + 1).padStart(2, '0')}-${String(modifiedDate.getDate()).padStart(2, '0')}`;

             const created = `[created::date(${createdFormatted})]`;
             const modified = `[modified::date(${modifiedFormatted})]`;
             
             const tagsList = ["github-star"];
             if (repo.language) tagsList.push(`lang/${repo.language.toLowerCase()}`);
             if (repo.topics) repo.topics.forEach(t => tagsList.push(`topic/${t}`));
             const tags = `[tags::multi(${tagsList.join(",")})]`;

             const properties = `%% ${aliases} ${starsCount} ${url} ${owner} ${language} ${description} ${created} ${modified} ${tags} %%`;

             contentToAppend += `## ${title}\n${properties}\n\n${repo.description || ""}\n\n`;
             newCount++;
        }

        if (contentToAppend !== "") {
            await this.app.vault.process(file, (data) => {
                return data + "\n" + contentToAppend;
            });
            new Notice(`Github Auto-Sync: Added ${newCount} new stars.`);
        } else {
            console.log("Github Auto-Sync: No new stars found.");
        }
    }
}
