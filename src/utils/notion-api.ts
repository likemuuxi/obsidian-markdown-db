import { requestUrl, RequestUrlParam } from "obsidian";

export class NotionAPI {
    private token: string;
    private baseUrl = "https://api.notion.com/v1";
    private version = "2022-06-28";

    constructor(token: string) {
        this.token = token;
    }

    private async request(endpoint: string, method: string, body?: any) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            "Authorization": `Bearer ${this.token}`,
            "Notion-Version": this.version,
            "Content-Type": "application/json",
        };

        const params: RequestUrlParam = {
            url,
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            throw: false
        };

        try {
            const response = await requestUrl(params);
            if (response.status >= 400) {
                console.error(`Notion API Error ${response.status}:`, response.text);
                console.error("Request Body:", body); // Log the body causing error
                throw new Error(`Notion API Error: ${response.status} ${response.text}`);
            }
            return response.json;
        } catch (error) {
            console.error("Notion API Request Failed:", error);
            if (body) console.error("Request Body was:", JSON.stringify(body, null, 2));
            throw error;
        }
    }

    async addItemToDatabase(databaseId: string, properties: any) {
        return this.request("/pages", "POST", {
            parent: { database_id: databaseId },
            properties: properties,
        });
    }

    async updatePage(pageId: string, properties: any, options?: any) {
        const body: any = {
            properties: properties,
        };
        if (options) {
            Object.assign(body, options);
        }
        return this.request(`/pages/${pageId}`, "PATCH", body);
    }

    async initiateFileUpload(filename: string, contentType: string) {
        // Step 1: Create file upload object
        const body = {
            filename: filename,
            content_type: contentType,
            mode: "single_part"
        };
        return this.request("/file_uploads", "POST", body);
    }

    private buildMultipartBody(params: {
        fieldName: string;
        filename: string;
        contentType: string;
        binary: ArrayBuffer;
    }): { body: ArrayBuffer; boundary: string } {
        const boundary = `----NotionFormBoundary${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
        const textEncoder = new TextEncoder();

        const safeFilename = params.filename.replace(/"/g, '\\"');
        const prefix = [
            `--${boundary}\r\n`,
            `Content-Disposition: form-data; name="${params.fieldName}"; filename="${safeFilename}"\r\n`,
            `Content-Type: ${params.contentType}\r\n`,
            `\r\n`,
        ].join("");
        const suffix = `\r\n--${boundary}--\r\n`;

        const prefixBytes = textEncoder.encode(prefix);
        const fileBytes = new Uint8Array(params.binary);
        const suffixBytes = textEncoder.encode(suffix);

        const out = new Uint8Array(prefixBytes.length + fileBytes.length + suffixBytes.length);
        out.set(prefixBytes, 0);
        out.set(fileBytes, prefixBytes.length);
        out.set(suffixBytes, prefixBytes.length + fileBytes.length);

        return { body: out.buffer, boundary };
    }

    async uploadFileContent(uploadUrl: string, fileData: ArrayBuffer, contentType: string, filename: string) {
        // Step 2: Upload actual file content via POST multipart/form-data
        try {
            const { body, boundary } = this.buildMultipartBody({
                fieldName: "file", // Field name must be 'file'
                filename: filename,
                contentType: contentType,
                binary: fileData
            });

            const req: RequestUrlParam = {
                url: uploadUrl,
                method: 'POST',
                body: body, // requestUrl accepts ArrayBuffer
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`,
                    "Notion-Version": this.version,
                    // Authorization is usually NOT sent to the signed upload URL if it's S3, 
                    // BUT Notion's /send endpoint might need it? 
                    // Reference code *does* send Authorization: Bearer token.
                    "Authorization": `Bearer ${this.token}`,
                    "accept": "application/json"
                },
                throw: false
            };

            const response = await requestUrl(req);
            if (response.status >= 400) {
                console.error("Upload uploadFileContent failed:", response.status, response.text);
                throw new Error(`Upload failed: ${response.text}`);
            }
            return response;
        } catch (e) {
            console.error("File content upload failed:", e);
            throw e;
        }
    }


    async getDatabase(databaseId: string) {
        return this.request(`/databases/${databaseId}`, "GET");
    }

    async queryDatabase(databaseId: string, filter?: any, sorts?: any[]) {
        const body: any = {};
        if (filter) body.filter = filter;
        if (sorts) body.sorts = sorts;

        const response = await this.request(`/databases/${databaseId}/query`, "POST", body);
        return response.results;
    }

    async retrievePage(pageId: string) {
        return this.request(`/pages/${pageId}`, "GET");
    }

    async retrieveBlockChildren(blockId: string) {
        return this.request(`/blocks/${blockId}/children`, "GET");
    }

    async appendBlockChildren(blockId: string, children: any[]) {
        return this.request(`/blocks/${blockId}/children`, "PATCH", {
            children: children
        });
    }

    async deleteBlock(blockId: string) {
        return this.request(`/blocks/${blockId}`, "DELETE");
    }
}
