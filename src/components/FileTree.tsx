import * as React from "react";
import { useState, useMemo } from "react";
import { TFile, TFolder, setIcon, Menu } from "obsidian";

interface FileTreeNode {
    path: string;
    name: string;
    type: "file" | "folder";
    children: Record<string, FileTreeNode>;
    file?: TFile;
}

const Icon = ({ name, className }: { name: string; className?: string }) => {
    const ref = React.useRef<HTMLSpanElement>(null);

    React.useEffect(() => {
        if (ref.current) {
            ref.current.empty();
            setIcon(ref.current, name);
        }
    }, [name]);

    return <span ref={ref} className={className} style={{ display: "flex", alignItems: "center" }} />;
};

interface FileTreeProps {
    files: TFile[];
    folders?: TFolder[];
    selectedFile: TFile | null;
    rootPath?: string;
    onSelect: (file: TFile) => void;
    onOpenFile: (file: TFile) => void;
    onFileContextMenu: (file: TFile, event: React.MouseEvent) => void;
    onFolderContextMenu: (folderPath: string, event: React.MouseEvent) => void;
    onMoveFile?: (file: TFile, newPath: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
    files,
    folders = [],
    selectedFile,
    rootPath,
    onSelect,
    onOpenFile,
    onFileContextMenu,
    onFolderContextMenu,
    onMoveFile
}) => {
    const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
    const [dragOverNode, setDragOverNode] = useState<string | null>(null);

    const toggleCollapse = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(collapsedFolders);
        if (newSet.has(path)) {
            newSet.delete(path);
        } else {
            newSet.add(path);
        }
        setCollapsedFolders(newSet);
    };

    const handleDragStart = (e: React.DragEvent, file: TFile) => {
        e.dataTransfer.setData("application/obsidian-file-path", file.path);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, node: FileTreeNode) => {
        e.preventDefault();
        e.stopPropagation();
        if (node.type === "folder") {
            setDragOverNode(node.path);
            e.dataTransfer.dropEffect = "move";
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverNode(null);
    };

    const handleDrop = (e: React.DragEvent, targetFolderNode: FileTreeNode) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverNode(null);

        const filePath = e.dataTransfer.getData("application/obsidian-file-path");
        if (!filePath || !onMoveFile) return;

        // Determine target path
        // If node.path is empty (root), use rootPath
        const targetPath = targetFolderNode.path !== "" ? targetFolderNode.path : (rootPath || "");

        const file = files.find(f => f.path === filePath);
        if (file) {
            const newPath = (targetPath ? targetPath + "/" : "") + file.name;
            if (newPath !== file.path) {
                onMoveFile(file, newPath);
            }
        }
    };

    const tree = useMemo(() => {
        const root: FileTreeNode = {
            path: "",
            name: "",
            type: "folder",
            children: {}
        };

        const getRelativePath = (fullPath: string) => {
            if (!rootPath) return fullPath;
            if (fullPath === rootPath) return ""; // Root folder itself
            if (fullPath.startsWith(rootPath + "/")) {
                return fullPath.substring(rootPath.length + 1);
            }
            return null; // Outside root
        };

        const addFolderToTree = (folderPath: string) => {
            const relativePath = getRelativePath(folderPath);
            if (relativePath === null) return;
            if (relativePath === "") return; // Don't add root folder as a child

            const parts = relativePath.split("/").filter(p => p);
            let current = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (!current.children[part]) {
                    // Reconstruct full path for the node logic
                    const relativeFolderPath = parts.slice(0, i + 1).join("/");
                    const fullNodePath = rootPath ? `${rootPath}/${relativeFolderPath}` : relativeFolderPath;

                    current.children[part] = {
                        path: fullNodePath,
                        name: part,
                        type: "folder",
                        children: {}
                    };
                }
                current = current.children[part];
            }
        };

        // Add explicit folders first
        folders.forEach(folder => {
            addFolderToTree(folder.path);
        });

        // Add files and their parent folders
        files.forEach(file => {
            const relativePath = getRelativePath(file.path);
            if (relativePath === null) return;

            const parts = relativePath.split("/");
            let current = root;

            // Handle folders
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!current.children[part]) {
                    const relativeFolderPath = parts.slice(0, i + 1).join("/");
                    const fullNodePath = rootPath ? `${rootPath}/${relativeFolderPath}` : relativeFolderPath;

                    current.children[part] = {
                        path: fullNodePath,
                        name: part,
                        type: "folder",
                        children: {}
                    };
                }
                current = current.children[part];
            }

            // Handle file
            const fileName = parts[parts.length - 1];
            current.children[fileName] = {
                path: file.path,
                name: file.basename,
                type: "file",
                children: {},
                file: file
            };
        });

        return root;
    }, [files, folders, rootPath]);

    const renderNode = (node: FileTreeNode, depth: number) => {
        if (node.type === "file" && node.file) {
            return (
                <div
                    key={node.path}
                    className={`markdown-db-file-item ${selectedFile?.path === node.file.path ? "active" : ""}`}
                    draggable={true}
                    onDragStart={(e) => node.file && handleDragStart(e, node.file)}
                    onClick={() => node.file && onSelect(node.file)}
                    onDoubleClick={() => node.file && onOpenFile(node.file)}
                    onContextMenu={(e) => node.file && onFileContextMenu(node.file, e)}
                    style={{ paddingLeft: `${depth * 12 + 12}px` }}
                >
                    <Icon name="table-properties" className="markdown-db-file-icon" />
                    <span className="markdown-db-file-name">{node.name}</span>
                </div>
            );
        } else if (node.type === "folder" && node.path !== "") { // Skip root node itself, just render children
            const isCollapsed = collapsedFolders.has(node.path);
            const isDragOver = dragOverNode === node.path;

            return (
                <div key={node.path}>
                    <div
                        className={`markdown-db-folder-item ${isDragOver ? "drag-over" : ""}`}
                        onClick={(e) => toggleCollapse(node.path, e)}
                        onContextMenu={(e) => onFolderContextMenu(node.path, e)}
                        onDragOver={(e) => handleDragOver(e, node)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, node)}
                        style={{
                            paddingLeft: `${(depth - 1) * 12 + 12}px`,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            padding: "4px 8px",
                            backgroundColor: isDragOver ? "var(--background-modifier-hover)" : undefined
                        }}
                    >
                        <span style={{ marginRight: "4px", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s" }}>
                            <Icon name="chevron-down" className="markdown-db-folder-icon" />
                        </span>
                        <Icon name={isCollapsed ? "folder-closed" : "folder"} className="markdown-db-folder-icon" />
                        <span className="markdown-db-file-name" style={{ marginLeft: "6px" }}>{node.name}</span>
                    </div>
                    {!isCollapsed && (
                        <div>
                            {Object.values(node.children)
                                .sort((a, b) => {
                                    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                                    return a.name.localeCompare(b.name);
                                })
                                .map(child => renderNode(child, depth + 1))}
                        </div>
                    )}
                </div>
            );
        } else {
            // Root node recursion
            return (
                <div
                    onDragOver={(e) => handleDragOver(e, node)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, node)}
                    style={{ minHeight: "100%", paddingBottom: "20px" }}
                >
                    {Object.values(node.children)
                        .sort((a, b) => {
                            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map(child => renderNode(child, depth + 1))}
                </div>
            );
        }
    };

    return (
        <div className="markdown-db-file-tree">
            {renderNode(tree, 0)}
        </div>
    );
};
