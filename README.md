# Markdown DB

[简体中文](./README.zh-CN.md) | English

**Turn your Markdown files into a database.**

An Obsidian plugin that renders any Markdown file as a Notion-like database table, with views, filters, sorts, property types, templates, and integrations (GitHub, Notion). All data stays in plain Markdown inside your vault.

## Features

- **Database table view**: Open any Markdown file as an interactive table. Mark a file with `markdown-db: true` in its frontmatter and it opens as a database automatically.
- **Dashboard**: A sidebar dashboard to browse, create, rename, move, and delete all your databases.
- **Records**: Click a row to open a record modal — edit title, properties, and content; support for child records.
- **Property types**: `text`, `number`, `boolean`, `date`, `select`, `multi-select`, and `link`, with inline cell editing and suggestions.
- **Views**: Save multiple views per database with filters, sorts, page size, open mode (modal / split pane / current tab), and adaptive height.
- **Templates**: Pick a template file when creating new records.
- **File explorer integration**: Right-click a folder to create a new DB file; databases get a `DB` badge.
- **Embeds**: Embed a database anywhere in a note.
- **Import**: Import from an Obsidian folder, GitHub Stars, or GitHub Pull Requests into a database.
- **GitHub auto-sync**: Automatically sync your stars and PRs on startup.
- **Notion sync**: Two-way sync (push/pull) between Notion databases and Markdown DB files.
- **i18n**: UI follows your Obsidian language (English and 简体中文 built in).

## Usage

1. Enable the plugin in **Settings → Community plugins**.
2. Run **Open Database Dashboard** (ribbon icon or command) and create a database, or right-click a folder in the file explorer and choose **New DB File**.
3. Add records with the **Create** button, set property types via the column menu, and configure views from the toolbar.
4. To turn an existing Markdown file into a database, add this frontmatter:

   ```yaml
   ---
   markdown-db: true
   ---
   ```

## Commands

| Command | Description |
|---|---|
| Open Database Dashboard | Open the database dashboard |
| Quick Switch Database | Fuzzy-switch between databases |
| Import to Database | Import folder / GitHub Stars / PRs |
| Toggle Database Table View | Switch between table and Markdown view |
| Scan Database Files for Property Values | Rebuild property value suggestions |
| Format Database Files | Normalize `%% %%` property blocks and spacing |

## Development

```bash
npm i        # install dependencies
npm run dev  # build in watch mode
npm run build # production build
```

## Manual installation

Copy `main.js`, `styles.css`, and `manifest.json` into `VaultFolder/.obsidian/plugins/markdown-db/`, then reload Obsidian and enable the plugin.

## Adding a language

All UI strings live in `src/i18n/`. To add a language, create a dictionary with the same shape as `src/i18n/en.ts` and register it in `src/i18n/index.ts`.

## License

MIT © [Muuxi](https://github.com/likemuuxi/obsidian-markdown-db)
