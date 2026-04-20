# Contributing to Atlas 1

Thanks for your interest. Atlas 1 is an open-source life console designed to be forked and extended. This doc covers the shortest path from clone to useful change.

## Dev setup

Prerequisites: Node 20+, pnpm 9+, Rust stable, and your platform's Tauri prerequisites (https://v2.tauri.app/start/prerequisites).

```bash
git clone https://github.com/dontcallmejames/atlas-1.git
cd atlas-1
pnpm install
pnpm tauri:dev
```

First Tauri build takes 2–5 minutes (compiling Rust). Subsequent starts are fast.

## Repo layout

- `apps/console/` — the webview UI (TypeScript, Lit-free vanilla DOM).
- `src-tauri/` — Rust backend: window, FS IPC, global shortcut.
- `packages/sdk/` — plugin authoring interfaces. **Read this first if you're writing a plugin.**
- `packages/core/` — runtime: command registry, vault adapter, event bus, XP store, rituals.
- `plugins/{tasks,journal,habits}/` — built-in v1 plugins. Plain JavaScript with JSDoc types.
- `docs/superpowers/specs/` — design specs.
- `docs/superpowers/plans/` — per-milestone implementation plans.

## Writing a plugin

A plugin is a directory under `plugins/<id>/` with a `main.js` exporting a default class that implements `Plugin` from `@atlas/sdk`.

Minimum viable plugin:

```js
/** @typedef {import("@atlas/sdk").Plugin} Plugin */
/** @typedef {import("@atlas/sdk").PluginContext} PluginContext */

export default class HelloPlugin {
  /** @param {PluginContext} ctx */
  async onload(ctx) {
    ctx.commands.register({
      id: "greet",
      title: "Say hello",
      run: async () => {
        ctx.events.emit("ui:toast", { message: "hello" });
      },
    });
  }

  /** @param {PluginContext} _ctx */
  async onunload(_ctx) {}
}
```

Reference: the three built-in plugins (`plugins/tasks`, `plugins/journal`, `plugins/habits`) cover the common patterns — command registration, vault IO, XP awards, UI views, and event subscriptions. Read those before reading `packages/core`; the SDK surface is the contract.

## Tests

```bash
pnpm test        # unit tests across all packages and plugins
pnpm typecheck   # tsc across the workspace
pnpm test:e2e    # Playwright smoke test (requires pnpm build first)
```

Add a test for every behavior change. Each package uses Vitest — see existing `*.test.ts` / `*.test.js` files for patterns.

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `test:`. Keep subject under 72 chars. Body explains *why*, not *what*.

## Before opening a PR

1. `pnpm typecheck && pnpm test` — both green.
2. Rebase on `main`.
3. PR description: what, why, how you tested.

## Questions

Open a discussion or issue. This is a small project — direct is fine.
