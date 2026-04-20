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

Start from `plugins/template/`. The fastest way:

```bash
pnpm new:plugin my-plugin
```

That copies the template, rewrites the id everywhere, and leaves you a working plugin to iterate on. Open `plugins/my-plugin/main.js` and add your own commands, views, and event handlers.

Reference: the three built-in plugins (`plugins/tasks`, `plugins/journal`, `plugins/habits`) cover the common patterns — command registration, vault IO, XP awards, UI views, and event subscriptions. Read those before reading `packages/core`; the SDK surface is the contract.

## Plugin trust model

Atlas 1 loads built-in plugins into the same webview as the console shell. Plugins therefore have the full privileges of the console: they can read and write to the DOM, call `fetch`, call every exposed Tauri IPC command, and they share memory with other plugins.

The `ctx.vault` wrapper that each plugin receives is **defence-in-depth, not a sandbox**. It scopes ordinary vault calls to `plugins/<your-id>/`, but a hostile plugin can bypass it by importing `@tauri-apps/api/core` and calling `invoke("vault_read", { path: "..." })` directly. Treat the wrapper as a coordination tool (it keeps plugins from clobbering each other by accident), not as a security control.

Atlas 1 is designed for forks where the author controls the full plugin set. Do not install a plugin you have not read. If you ship Atlas publicly, ship it as a template that users fork and customise — do not build a plugin marketplace on top of v1.

**What a plugin can do:**
- Read and write files anywhere in the vault via the IPC surface (bypassing `scopeVaultFs`).
- Register arbitrary commands in the command registry.
- Subscribe to every event on the bus.
- Register global keyboard listeners on `window`.
- Issue `fetch` calls to any network destination not blocked by CSP.

**What CSP currently blocks:**
- Loading scripts from domains other than `self` — a malicious plugin cannot inject a remote payload by adding a `<script src="...">`.
- Connecting to arbitrary origins via `fetch` — only `self` and the Tauri IPC channels. This means a malicious plugin cannot exfiltrate data over `fetch` to an attacker-controlled domain without first being able to execute arbitrary script, which CSP blocks.

**Planned hardening (v2+):**
- Move plugins into Web Workers or an `<iframe srcdoc>` sandbox with a `postMessage`-only bridge.
- Enforce `permissions` from `manifest.json` at the Rust IPC layer, not just in JS.
- Restrict `set_vault_root` to onboarding so a plugin can't repoint the vault at runtime.

If any of these ship earlier than v2, the above list should be trimmed accordingly.

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
