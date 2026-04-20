# Tasks

Built-in plugin for Atlas 1 — a minimal GFM-style task list backed by a
single file, `<vault>/tasks/inbox.md`.

## Data

Each line is a GitHub-style task:

    - [ ] buy milk  ^id-abc
    - [x] done thing  ^id-xyz

The `^id-<9chars>` suffix is auto-generated; the text between the brackets
and the id is the task description.

## Commands

| Command                      | Description                                  |
|------------------------------|----------------------------------------------|
| `/tasks.add <text>`          | Append a new open task to inbox.md           |
| `/tasks.done <id \| text>`   | Mark a task done; awards 25 XP               |
| `/tasks.undone <id \| text>` | Reopen a completed task                      |
| `/tasks.list`                | Log every task in the inbox (devtools)       |
| `/tasks.archive`             | Move done tasks to `archive/YYYY-MM.md`      |

## UI

Registers a `tasks` nav tab. The view renders the inbox with a clickable
checkbox per task. Toggling the checkbox invokes the same commands the
REPL does.

## Fork pointers

- All behavior lives in [main.js](./main.js) and [parser.js](./parser.js).
- No build step — plain JS with JSDoc types that pull from `@atlas/sdk`.
- The plugin uses only the public `ctx` API; the same code works for a
  third-party fork dropped in `<vault>/.atlas/plugins/`.
