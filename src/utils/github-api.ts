import { requestUrl, RequestUrlParam } from "obsidian";

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

export interface GithubPRItem {
    number: number;
    title: string;
    state: string;
    html_url: string;
    repository_url: string;
    created_at: string;
    updated_at: string;
    draft: boolean;
    author_association: string;
    pull_request?: {
        merged_at?: string | null;
        html_url?: string;
    };
    user: {
        login: string;
    };
    body?: string;
    labels?: {
        name: string;
        color: string;
        description?: string;
    }[];
}

export interface GithubSearchResponse {
    total_count: number;
    incomplete_results: boolean;
    items: GithubPRItem[];
}

export async function fetchGithubStars(username: string, token: string): Promise<StarredRepo[]> {
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
                'Accept': 'application/vnd.github.v3+json,application/vnd.github.mercy-preview+json',
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

export async function fetchGithubPRs(username: string, token: string): Promise<GithubPRItem[]> {
    let page = 1;
    const perPage = 100;
    let allItems: GithubPRItem[] = [];
    let hasMore = true;

    while (hasMore) {
        const query = `author:${username} type:pr`;
        const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&sort=created&order=desc`;
        
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

            const data = response.json as GithubSearchResponse;
            const items = data.items;

            if (!items || items.length === 0) {
                hasMore = false;
            } else {
                allItems = allItems.concat(items);
                if (items.length < perPage) {
                    hasMore = false;
                } else {
                    page++;
                    if (page > 10) hasMore = false; 
                }
            }
        } catch (e) {
            console.error("Failed to fetch page " + page, e);
            throw e;
        }
    }
    return allItems;
}

export function formatStarToMarkdown(repo: StarredRepo): { title: string, content: string } {
    const title = repo.name.replace(/[\\/:*?"<>|]/g, "-");
    
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

    const content = `## ${title}\n${properties}\n\n${repo.description || ""}\n\n`;
    
    return { title, content };
}

export function formatPRToMarkdown(pr: GithubPRItem): { title: string, content: string } {
    const title = pr.title.replace(/[\\/:*?"<>|]/g, "-");

    // Map fields
    const repoNameRaw = pr.repository_url.split("/").pop() || "";
    
    const repoName = `[repo_name::text(${repoNameRaw})]`;
    
    const stateStr = pr.state.charAt(0).toUpperCase() + pr.state.slice(1);
    const state = `[state::select(${stateStr})]`;
    
    const reviewStateStr = pr.draft ? "Draft" : "Ready";
    const reviewState = `[review_state::select(${reviewStateStr})]`;
    
    const isMerged = !!(pr.pull_request?.merged_at);
    const merged = `[merged::boolean(${isMerged})]`;
    
    const roleRaw = pr.author_association.toLowerCase();
    const roleStr = roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1);
    const authorRole = `[author_role::select(${roleStr})]`;
    
    const updatedDate = new Date(pr.updated_at);
    const updatedFormatted = `${updatedDate.getFullYear()}-${String(updatedDate.getMonth() + 1).padStart(2, '0')}-${String(updatedDate.getDate()).padStart(2, '0')}`;
    const updatedAt = `[updated_at::date(${updatedFormatted})]`;

    const url = `[url::link(${pr.html_url})]`;

    const labelsRaw = pr.labels?.map(l => l.name) || [];
    const labels = `[labels::multi(${labelsRaw.join(",")})]`;

    const properties = `%% ${repoName} ${merged} ${state} ${reviewState} ${authorRole} ${url} ${updatedAt} ${labels} %%`;

    let bodyContent = pr.body || "";
    if (bodyContent) {
        // Downgrade headings to start from level 3 (H3) if they are H1 or H2? 
        // The original code does: replace(/^(#+)/gm, "##$1"); which adds ## to everything.
        // So # -> ###, ## -> ####
        bodyContent = bodyContent.replace(/^(#+)/gm, "##$1");
    }
    
    const content = `## ${title}\n${properties}\n\n${bodyContent}\n\n`;

    return { title, content };
}

export function mergeMarkdownContent<T>(
    items: T[],
    formatter: (item: T) => { title: string, content: string },
    existingContent: string,
    mode: 'append-only' | 'update'
): { fullContent: string, newCount: number, updatedCount: number, newContentOnly: string } {
    let currentContent = existingContent || "";
    let newContentOnly = "";
    let newCount = 0;
    let updatedCount = 0;

    for (const item of items) {
        const { title, content } = formatter(item);
        const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Full block regex: matches ## Title ... until next ## or EOF
        const recordRegex = new RegExp(`^##\\s+${escapedTitle}\\s*$(?:\\r?\\n|\\r)(?:[\\s\\S]*?)(?=(?:^##\\s)|$)`, 'm');
        
        const exists = recordRegex.test(currentContent);

        if (exists) {
            if (mode === 'update') {
                currentContent = currentContent.replace(recordRegex, content.trimEnd() + "\n\n");
                updatedCount++;
            }
            // If append-only, we skip
        } else {
            newContentOnly += content;
            newCount++;
        }
    }
    
    let finalContent = currentContent;
    if (newContentOnly) {
        // Ensure separation
        if (finalContent && !finalContent.endsWith("\n")) finalContent += "\n";
        if (finalContent && !finalContent.endsWith("\n\n")) finalContent += "\n";
        finalContent += newContentOnly;
    }

    return {
        fullContent: finalContent,
        newCount,
        updatedCount,
        newContentOnly
    };
}
