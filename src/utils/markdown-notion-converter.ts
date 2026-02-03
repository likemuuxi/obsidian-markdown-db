
// Simple Markdown <-> Notion Block converter

export function markdownToNotionBlocks(markdown: string): any[] {
    const lines = markdown.split('\n');
    const blocks: any[] = [];

    for (const line of lines) {
        if (line.trim() === '') continue;

        // Check for image: ![alt](url)
        const imageMatch = line.match(/^!\[(.*?)\]\((.*?)\)/);
        if (imageMatch) {
            const alt = imageMatch[1];
            const url = imageMatch[2];
            // Notion requires valid external URL. 
            // Local paths won't work without upload. 
            // For now, we only support http/https.
            if (url.startsWith('http')) {
                blocks.push({
                    object: 'block',
                    type: 'image',
                    image: {
                        type: 'external',
                        external: {
                            url: url
                        },
                        caption: alt ? [{ type: 'text', text: { content: alt } }] : []
                    }
                });
            } else {
                // Return special local_image block for processing by the caller
                blocks.push({
                    type: 'local_image',
                    image: {
                        path: url,
                        alt: alt
                    }
                });
            }
            continue;
        }

        // Check for Obsidian embed: ![[filename]]
        const embedMatch = line.match(/^!\[\[(.*?)\]\]/);
        if (embedMatch) {
            const content = embedMatch[1];
            const parts = content.split('|');
            const file = parts[0];
            const alt = parts.length > 1 ? parts[1] : file;

            // Return special local_image block
            blocks.push({
                type: 'local_image',
                image: {
                    path: file,
                    alt: alt
                }
            });
            continue;
        }

        if (line.startsWith('# ')) {
            blocks.push({
                object: 'block',
                type: 'heading_1',
                heading_1: {
                    rich_text: parseRichText(line.substring(2))
                }
            });
        } else if (line.startsWith('## ')) {
            blocks.push({
                object: 'block',
                type: 'heading_2',
                heading_2: {
                    rich_text: parseRichText(line.substring(3))
                }
            });
        } else if (line.startsWith('### ')) {
            blocks.push({
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: parseRichText(line.substring(4))
                }
            });
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            blocks.push({
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: parseRichText(line.substring(2))
                }
            });
        } else if (line.match(/^\d+\. /)) {
            const content = line.replace(/^\d+\. /, '');
            blocks.push({
                object: 'block',
                type: 'numbered_list_item',
                numbered_list_item: {
                    rich_text: parseRichText(content)
                }
            });
        } else if (line.startsWith('> ')) {
            blocks.push({
                object: 'block',
                type: 'quote',
                quote: {
                    rich_text: parseRichText(line.substring(2))
                }
            });
        } else if (line.startsWith('```')) {
            // Basic code block handling could be improved to capture multiline
            // For single line assumption in this loop, specific handling might be needed
            // But usually code blocks are multiline. 
            // Simplification: Treat as paragraph if inline, or ignore if fence marker.
            // If we want real code block support, we need a standard parser/state machine.
            // For now, let's treat it as paragraph if it has content, or maybe skip.
            if (line.length > 3) {
                blocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: parseRichText(line)
                    }
                });
            }
        } else {
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: parseRichText(line)
                }
            });
        }
    }
    return blocks;
}

function parseRichText(text: string): any[] {
    const tokens: any[] = [];
    let currentIndex = 0;

    // Regex for bold (** or __), italic (* or _), strike (~~), code (`), link ([text](url))
    // We need to match efficiently.
    // Order matters somewhat if we want to support nesting, but for simple implementation:
    // We can use a regex that finds the *first* occurrence of any special char.

    // Simplified parser: Identify non-overlapping styles.
    // Improving regex to capture:
    // 1. Link: \[([^\]]+)\]\(([^)]+)\)
    // 2. Bold: \*\*([^\*]+)\*\*
    // 3. Italic: \*([^\*]+)\*
    // 4. Code: `([^`]+)`

    // We will iterate through the string.

    while (currentIndex < text.length) {
        const remaining = text.substring(currentIndex);

        // Find matches
        const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        const boldMatch = remaining.match(/^\*\*([^\*]+)\*\*/);
        const italicMatch = remaining.match(/^\*([^\*]+)\*/);
        const codeMatch = remaining.match(/^`([^`]+)`/);

        if (linkMatch) {
            tokens.push({
                type: 'text',
                text: { content: linkMatch[1], link: { url: linkMatch[2] } }
            });
            currentIndex += linkMatch[0].length;
        } else if (boldMatch) {
            tokens.push({
                type: 'text',
                text: { content: boldMatch[1] },
                annotations: { bold: true }
            });
            currentIndex += boldMatch[0].length;
        } else if (italicMatch) {
            tokens.push({
                type: 'text',
                text: { content: italicMatch[1] },
                annotations: { italic: true }
            });
            currentIndex += italicMatch[0].length;
        } else if (codeMatch) {
            tokens.push({
                type: 'text',
                text: { content: codeMatch[1] },
                annotations: { code: true }
            });
            currentIndex += codeMatch[0].length;
        } else {
            // No match at start, advance one distinct char or chunk until next special char
            // To make it faster, find the nearest special char index
            const nextSpecial = remaining.search(/\[|\*\*|\*|`/);

            if (nextSpecial === -1) {
                // No more special chars
                tokens.push({
                    type: 'text',
                    text: { content: remaining }
                });
                currentIndex += remaining.length;
            } else if (nextSpecial === 0) {
                // It matched a start char but didn't match the full regex (e.g. single *)
                // Treat first char as literal
                tokens.push({
                    type: 'text',
                    text: { content: remaining[0] }
                });
                currentIndex += 1;
            } else {
                // Add text before special char
                tokens.push({
                    type: 'text',
                    text: { content: remaining.substring(0, nextSpecial) }
                });
                currentIndex += nextSpecial;
            }
        }
    }

    if (tokens.length === 0) {
        return [{ type: 'text', text: { content: text } }];
    }

    return tokens;
}

export function notionBlocksToMarkdown(blocks: any[]): string {
    let markdown = '';

    for (const block of blocks) {
        if (block.type === 'paragraph') {
            const text = block.paragraph.rich_text.map((t: any) => t.plain_text).join('');
            markdown += text + '\n\n';
        } else if (block.type === 'heading_1') {
            const text = block.heading_1.rich_text.map((t: any) => t.plain_text).join('');
            markdown += '# ' + text + '\n\n';
        } else if (block.type === 'heading_2') {
            const text = block.heading_2.rich_text.map((t: any) => t.plain_text).join('');
            markdown += '## ' + text + '\n\n';
        } else if (block.type === 'heading_3') {
            const text = block.heading_3.rich_text.map((t: any) => t.plain_text).join('');
            markdown += '### ' + text + '\n\n';
        } else if (block.type === 'bulleted_list_item') {
            const text = block.bulleted_list_item.rich_text.map((t: any) => t.plain_text).join('');
            markdown += '- ' + text + '\n';
        } else if (block.type === 'numbered_list_item') {
            const text = block.numbered_list_item.rich_text.map((t: any) => t.plain_text).join('');
            markdown += '1. ' + text + '\n';
        } else if (block.type === 'to_do') {
            const text = block.to_do.rich_text.map((t: any) => t.plain_text).join('');
            const checked = block.to_do.checked ? 'x' : ' ';
            markdown += `- [${checked}] ` + text + '\n';
        }
        // Add more types as needed
    }

    return markdown.trim();
}
