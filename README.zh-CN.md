# Markdown DB

简体中文 | [English](./README.md)

**把你的 Markdown 文件变成数据库。**

一个 Obsidian 插件，可将任意 Markdown 文件渲染为类似 Notion 的数据库表格，支持视图、筛选、排序、属性类型、模板以及第三方集成（GitHub、Notion）。所有数据都以纯 Markdown 形式保存在你的仓库中。

## 功能特性

- **数据库表格视图**：任意 Markdown 文件都可以作为交互式表格打开。在 frontmatter 中标记 `markdown-db: true`，文件即自动以数据库形式打开。
- **仪表盘**：侧边栏仪表盘，可浏览、创建、重命名、移动和删除所有数据库。
- **记录**：点击行打开记录弹窗——编辑标题、属性和内容；支持子记录。
- **属性类型**：`text`、`number`、`boolean`、`date`、`select`、`multi-select`、`link`，支持单元格内联编辑与取值建议。
- **视图**：每个数据库可保存多个视图，包含筛选、排序、每页行数、打开方式（弹窗 / 分栏 / 当前标签页）与自适应高度。
- **模板**：新建记录时可选择模板文件。
- **文件管理器集成**：右键文件夹即可新建数据库文件；数据库文件带有 `DB` 徽章。
- **嵌入**：可在任意笔记中嵌入数据库。
- **导入**：支持从 Obsidian 文件夹、GitHub Stars、GitHub Pull Requests 导入到数据库。
- **GitHub 自动同步**：启动时自动同步你的 Star 和 PR。
- **Notion 同步**：Notion 数据库与 Markdown DB 文件之间的双向同步（推送/拉取）。
- **国际化**：界面跟随 Obsidian 语言（内置英文与简体中文）。

## 使用方法

1. 在 **设置 → 第三方插件** 中启用本插件。
2. 运行 **打开数据库仪表盘**（侧边栏图标或命令）创建数据库，或在文件管理器中右键文件夹选择 **新建数据库文件**。
3. 使用 **创建** 按钮添加记录，通过列菜单设置属性类型，并在工具栏配置视图。
4. 要把现有 Markdown 文件变成数据库，添加以下 frontmatter：

   ```yaml
   ---
   markdown-db: true
   ---
   ```

## 命令

| 命令 | 说明 |
|---|---|
| 打开数据库仪表盘 | 打开数据库仪表盘 |
| 快速切换数据库 | 模糊搜索切换数据库 |
| 导入到数据库 | 导入文件夹 / GitHub Stars / PR |
| 切换数据库表格视图 | 在表格与 Markdown 视图间切换 |
| 扫描数据库文件的属性值 | 重建属性取值建议 |
| 格式化数据库文件 | 规范 `%% %%` 属性块与空行 |

## 开发

```bash
npm i        # 安装依赖
npm run dev  # 监听模式构建
npm run build # 生产构建
```

## 手动安装

将 `main.js`、`styles.css`、`manifest.json` 复制到 `VaultFolder/.obsidian/plugins/markdown-db/`，重载 Obsidian 后启用插件。

## 添加新语言

所有界面文本位于 `src/i18n/`。新增语言时，创建一个与 `src/i18n/en.ts` 结构相同的词典，并在 `src/i18n/index.ts` 中注册即可。

## 许可证

MIT © [Muuxi](https://github.com/likemuuxi/obsidian-markdown-db)
