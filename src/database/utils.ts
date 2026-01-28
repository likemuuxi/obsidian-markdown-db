
export interface ExtractedProperty {
    key: string;
    value: string;
    full: string;
    start: number;
    end: number;
}

export function extractProperties(content: string): ExtractedProperty[] {
    const properties: ExtractedProperty[] = [];
    let i = 0;
    
    while (i < content.length) {
        if (content[i] === '[') {
            const start = i;
            let depth = 1;
            let j = i + 1;
            let separator = -1;
            
            while (j < content.length && depth > 0) {
                if (content[j] === '[') {
                    depth++;
                } else if (content[j] === ']') {
                    depth--;
                } else if (depth === 1 && content.substring(j, j + 2) === '::' && separator === -1) {
                    separator = j;
                }
                j++;
            }
            
            if (depth === 0 && separator !== -1) {
                // Found a valid property
                // j is now at the character AFTER the closing ']'
                const end = j;
                const key = content.substring(start + 1, separator).trim();
                // value is between separator+2 (after '::') and end-1 (before ']')
                const value = content.substring(separator + 2, end - 1).trim();
                
                properties.push({
                    key, 
                    value, 
                    full: content.substring(start, end),
                    start,
                    end
                });
                
                i = end;
                continue;
            }
        }
        i++;
    }
    return properties;
}
