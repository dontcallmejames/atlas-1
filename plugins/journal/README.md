# Journal

Built-in plugin for Atlas 1 — daily notes as plain Markdown files.

## Data

    <vault>/journal/
    |-- 2026/
    |   \-- 04/
    |       |-- 2026-04-19.md
    |       \-- 2026-04-20.md
    \-- 2026/05/...

Each file is freeform Markdown. Atlas does not impose structure.

## Commands

| Command                          | Description                                     |
|----------------------------------|-------------------------------------------------|
| `/journal.today`                 | Open today's entry in the journal view          |
| `/journal.open <YYYY-MM-DD>`     | Open a specific date                            |
| `/journal.append <text>`         | Append `- **HH:MM** <text>` to today's entry    |
| `/journal.list`                  | Log every existing entry date (devtools)        |

## UI

A two-column layout: left is a textarea for the current entry (autosaves
500 ms after the last keystroke and on blur), right is a clickable list of
the 14 most-recent dates.

## Fork pointers

- [main.js](./main.js) — lifecycle + commands + view.
- [parser.js](./parser.js) — pure date/path utilities.
- Uses only `@atlas/sdk` via JSDoc. No `@atlas/core` runtime dep.
