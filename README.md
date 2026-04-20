# Atlas 1

An open-source **life console** — terminal × game HUD for managing calendar, hobbies, health, work, play, and AI projects. Local-first, plain-text vault, plugin-based.

> Status: v0.1.0 — M1 skeleton. The shell renders, plugins are stubs. See `docs/superpowers/plans/` for the roadmap.

## Quick start

**Prerequisites:**
- Node 20+
- pnpm 9+ (`npm i -g pnpm`)
- Rust stable (https://rustup.rs)
- Platform-specific Tauri prerequisites: https://v2.tauri.app/start/prerequisites
  - **Windows:** Microsoft C++ Build Tools + WebView2 (ships with Win11).
  - **macOS:** Xcode Command Line Tools.
  - **Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`, others — see link.

**Install:**

```bash
pnpm install
```

**Run the desktop app in dev mode:**

```bash
pnpm tauri:dev
```

A native window opens rendering the Life Console prototype. First run compiles the Rust backend (~2–5 min); subsequent runs are fast.

**Run just the webview in a browser:**

```bash
pnpm dev
# open http://localhost:1420
```

**Build a distributable:**

```bash
pnpm tauri:build
# installers land in src-tauri/target/release/bundle/
```

## Repo layout

- `apps/console` — Lit/TypeScript webview (the UI).
- `src-tauri` — Rust backend (window, FS, IPC).
- `packages/sdk` — plugin authoring API (stub in M1).
- `packages/core` — runtime: command registry, vault adapter, event bus, XP store (stub in M1).
- `packages/ui` — shared Lit components (stub in M1).
- `plugins/{tasks,journal,habits}` — built-in v1 plugins (stubs in M1).
- `docs/superpowers/specs` — design specs.
- `docs/superpowers/plans` — implementation plans.

## Testing

```bash
pnpm test       # unit tests (none yet in M1)
pnpm test:e2e   # Playwright smoke test
pnpm typecheck  # tsc across all packages
```

## License

MIT — see `LICENSE`.
