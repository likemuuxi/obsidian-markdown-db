
export type PropertyType = 
    | "text" 
    | "number" 
    | "boolean" 
    | "date" 
    | "select" 
    | "multi" 
    | "link";

export const VALID_PROPERTY_TYPES: PropertyType[] = [
    "text",
    "number",
    "boolean",
    "date",
    "select",
    "multi",
    "link"
];

export const PROPERTY_TYPE_ICONS: Record<PropertyType, string> = {
    "text": "align-left",
    "number": "hash",
    "boolean": "check-square",
    "date": "calendar",
    "select": "circle-arrow-down",
    "multi": "list",
    "link": "link"
};

export interface SortRule {
    key: string;
    direction: "asc" | "desc";
}

export interface FilterRule {
    key: string;
    operator: "contains" | "not_contains" | "is" | "is_not" | "is_empty" | "is_not_empty";
    value: string;
}

export interface DatabaseConfig {
    openMode: "tab" | "split" | "modal";
    layout?: string;
    columnOrder?: string[];
    contentHeight?: "compact" | "adaptive";
    showContent?: boolean;
    sort?: SortRule[];
    filters?: FilterRule[];
    columnTypes?: Record<string, PropertyType>;
}

export interface TypedValue {
    type: PropertyType;
    value: any; // 具体类型取决于 type
}

export interface DatabaseRecord {
    id: string;
    title: string;
    // 属性现在映射到 TypedValue 数组，以支持同一属性的多个值（尽管通常是一个）
    properties: Record<string, TypedValue[]>;
    content: string;
    lineStart: number;
    lineEnd: number;
    // 记录属性所在的行号（用于快速更新）
    propertyLineIndex?: number; 
}

export interface DatabaseData {
    title: string;
    config: DatabaseConfig;
    records: DatabaseRecord[];
    allKeys: Set<string>;
}

/**
 * 辅助函数：将字符串值转换为 TypedValue
 */
export const parseTypedValue = (typeStr: string, valueStr: string): TypedValue => {
    const type = typeStr.toLowerCase() as PropertyType;
    let value: any = valueStr;

    switch (type) {
        case "number":
            value = parseFloat(valueStr);
            if (isNaN(value)) value = 0;
            break;
        case "boolean":
            value = valueStr.toLowerCase() === "true";
            break;
        case "date":
            // 保持字符串或解析为 Date 对象，视需求而定。暂时保持字符串以便于回写。
            value = valueStr; 
            break;
        case "multi":
            // 多选通常以逗号分隔，或者在存储时就是 split 好的
            // 这里假设 valueStr 是原始字符串，后续处理
            value = valueStr.split(/[,，]/).map(s => s.trim()).filter(s => s);
            break;
        default:
            value = valueStr;
    }

    return { type, value };
};

/**
 * 辅助函数：将 TypedValue 格式化为存储字符串 Type(Value)
 */
export const formatTypedValue = (typedValue: TypedValue): string => {
    let valStr = "";
    switch (typedValue.type) {
        case "text":
            return String(typedValue.value);
        case "multi":
             if (Array.isArray(typedValue.value)) {
                 valStr = typedValue.value.join(", ");
             } else {
                 valStr = String(typedValue.value);
             }
             break;
        default:
            valStr = String(typedValue.value);
    }
    return `${typedValue.type}(${valStr})`;
};
