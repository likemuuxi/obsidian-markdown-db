---
name: obsidian-markdown-db
description: Read, generate, and modify Markdown database files used by this Obsidian plugin. Use when Codex needs to create a new database file, edit records or properties, update database/view config blocks, repair a malformed DB note, or explain how to write Markdown that this plugin can parse safely.
---

# Obsidian Markdown DB

## Overview

Use this skill to work directly against the Markdown format that the plugin parses from `src/database/parser.ts` and writes from `src/database/writer.ts`.
Favor edits that preserve the plugin's parsing assumptions instead of inventing new syntax.

## Quick rules

- Treat a file as a database only if its frontmatter includes `markdown-db: true`.
- Keep the first H1 as the database title: `# Database Name`.
- Represent each record as an H2: `## Record Title`.
- Records support hierarchical nesting using H3–H6 headings as child records. A child record's heading level must be exactly one deeper than its parent (e.g. `##` parent → `###` child → `####` grandchild). Do not skip levels.
- Store record properties inside an Obsidian comment block immediately under the record:
  ```md
  %%
  [status::select(todo)]
  [tags::multi(work, urgent)]
  %%
  ```
- Store database config or view config in the same property syntax, but outside records and under the relevant H1.
- Keep view headers in the form `# Database Name(View Name)` and place them before records.
- Content inside fenced code blocks (```) is ignored by the parser. Headings inside code fences are never treated as records or record boundaries.
- Record titles must be non-empty. If a title is cleared, the plugin automatically falls back to `"Untitled"` with deduplication (e.g. `Untitled 1`, `Untitled 2`).

## Auto-wrapping of heading content

The writer automatically wraps record body content in a ` ```markdown ``` ` fenced code block when the content contains Markdown headings (`# ...`). This prevents the parser from interpreting body headings as child record headings.

When the parser reads a record, it automatically unwraps ` ```markdown ... ``` ` and ` ``` ... ``` ` fences, so the UI always displays the raw content without fences.

You do not need to manually add code fences around heading content — the plugin handles this transparently on save.

## File shape

Use this canonical layout unless the user is explicitly repairing a legacy file:

```md
---
markdown-db: true
---

# Projects
%%
[db-open-mode::split]
[db-layout::table]
[db-content-height::compact]
[db-columns::["name","status","owner"]]
[db-column-types::{"status":"select","owner":"text"}]
%%

# Projects(Board)
%%
[db-layout::board]
[db-columns::["status","owner"]]
%%

## Project Alpha
%%
[status::select(todo)]
[owner::text(Alice)]
[tags::multi(work, urgent)]
[priority::number(2)]
[url::link(https://example.com)]
%%

Freeform notes for the record.

### Sub-task Alpha-1
%%
[status::select(todo)]
[owner::text(Alice)]
%%

### Sub-task Alpha-2
%%
[status::select(done)]
[owner::text(Bob)]
%%

## Project Beta
%%
[status::select(done)]
[owner::text(Bob)]
%%
```

## Property syntax

Use bracket properties in the form `[key::value]`.

For typed record values, prefer these forms:

- `text`: `[name::text(Alice)]` or plain `[name::Alice]`
- `number`: `[score::number(42)]`
- `boolean`: `[done::boolean(true)]`
- `date`: `[due::date(2026-04-01)]`
- `select`: `[status::select(todo)]`
- `multi`: `[tags::multi(work, urgent)]`
- `link`: `[url::link(https://example.com)]`

Parser behavior to preserve:

- If the value looks like `type(...)` and `type` is one of the valid property types, it is parsed as that type.
- Otherwise the value is treated as text.
- `multi(...)` is split on commas, so write comma-separated values.
- Repeating the same key inside one record is allowed; the parser stores an array of typed values.

When editing existing files, preserve the user's chosen key names exactly. Do not silently rename fields.

## Config properties

Use config properties only in comment blocks attached to the main title H1 or a view H1.
Do not write them inside records.

Supported config keys:

- `[db-open-mode::split]`, `modal`, or `tab`
- `[db-layout::table]` or another layout string used by the plugin
- `[db-content-height::compact]` or `adaptive`
- `[db-show-content::true]`
- `[db-columns::["name","status"]]`
- `[db-sort::[{"key":"status","direction":"asc"}]]`
- `[db-filter::[{"key":"status","operator":"is","value":"todo"}]]`
- `[db-column-types::{"status":"select","estimate":"number"}]`
- `[db-hide-columns::["url"]]`
- `[db-page-size::20]`

Use valid JSON for array and object config values. The parser is tolerant in a few places, but JSON is the safest form.

## Safe editing workflow

When asked to modify a DB file, follow this order:

1. Parse the current structure mentally: frontmatter, main title, optional view H1 blocks, then record H2 blocks.
2. Keep the first H1 stable unless the task is explicitly renaming the database.
3. For record property edits, update only the target record's `%% ... %%` block.
4. For record content edits, preserve the property block and replace only the body text below it.
5. For config or view edits, update the comment block attached to the relevant H1.
6. Preserve spacing around comment blocks and headings. The writer favors a blank line between a property block and freeform content.

## Common operations

### Create a new record

Append a new H2 section near the end of the file:

```md
## New record
%%
[status::select(todo)]
[owner::text()]
%%
```

Ensure the title is unique among existing record H2 headings. If the title is empty, the plugin uses `"Untitled"` with auto-incrementing suffix.

### Rename a record

When renaming, the writer matches the heading line exactly (anchored to line start and end) to avoid false matches. If the new name is empty, it falls back to `"Untitled"` and deduplicates against existing titles.

### Update a property

Replace only the target property line if it exists. If it does not exist, add it inside the same `%% ... %%` block.
Delete a property by removing that bracket expression. If the block becomes empty, remove the whole `%% ... %%` block.

### Add a view

Insert a new H1 before the first record:

```md
# Projects(Calendar)
%%
[db-layout::calendar]
[db-columns::["due","owner"]]
%%
```

The parser recognizes a view only when the H1 starts with the main title followed by `(View Name)`.

### Reorder records

Move whole heading blocks, not individual lines. A record block runs from its heading line to the next heading of equal or higher level, or EOF.

### Add a child record

Insert a heading one level deeper than the parent, inside the parent's block:

```md
## Parent Task
%%
[status::select(todo)]
%%

### Child Task
%%
[status::select(todo)]
%%
```

The child heading must be exactly one level deeper than the parent. Do not skip levels (e.g. `##` → `####` is invalid).

### Write formatted body content

If a record's body text needs Markdown formatting (especially headings), the writer automatically wraps it in a fenced code block on save. You do not need to do this manually. The parser unwraps it on read.

## Parser and writer internals

### Code block awareness

Both the parser and writer track `inCodeBlock` state by detecting lines starting with ```. All heading detection, record boundary detection, and title scanning skip content inside fenced code blocks. This means:

- Headings inside code fences are never parsed as records.
- `findRecordStart` and `findRecordEnd` skip code blocks when locating record boundaries.
- `addRecord`, `addChildRecord`, and `reorderRecords` skip code blocks when scanning existing titles.
- `renameRecord` does not need to skip code blocks because it matches the exact heading line with anchors.

### View auto-patching

All DB files (frontmatter `markdown-db: true`) are automatically opened in the `markdown-db-view` regardless of how they are accessed: file explorer, quick switcher (Ctrl+O), search results, backlinks, etc. The monkey-patched `WorkspaceLeaf.openFile` intercepts all open operations. Only explicit `source`/`preview` mode requests bypass the DB view.

## UI interaction conventions

- **Content column**: Enter saves and exits editing. Shift+Enter inserts a newline.
- **Database title input**: Changes are committed on Enter or blur, not on every keystroke. Escape reverts to the original value.
- **Record title**: Saving an empty record title falls back to `"Untitled"` with automatic deduplication.

## Do not do this

- Do not invent alternate delimiters for properties.
- Do not place record properties outside `%% ... %%` and expect the plugin to parse them.
- Do not use a different view header pattern such as `# View: Board`.
- Do not write raw Markdown headings in record body text without wrapping them in a fenced code block, or they will be parsed as child records. (The plugin auto-wraps on save, but when editing files directly, wrap manually.)
- Do not skip heading levels when nesting records (e.g. `##` → `####`). Always increment by exactly one level.
- Do not convert typed config values into record-style wrappers like `text(split)` for config unless the file already does that intentionally.
- Do not leave record titles empty. Always use a non-empty title or rely on the plugin's "Untitled" fallback.

## Response style when using this skill

- Explain proposed file edits in terms of database title, view block, record block, and property block.
- If the user asks for raw Markdown, emit Markdown that matches this plugin's parser rules exactly.
- If the file is malformed, prefer repairing it into the canonical structure above instead of preserving ambiguous syntax.
