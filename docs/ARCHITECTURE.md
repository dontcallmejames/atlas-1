# Atlas 1 — Architecture

## Execution start

Boot is driven by `apps/console/src/main.ts`. Outside Tauri the console just paints a static preview; inside Tauri the real flow is:

```
main.ts
  └── startRuntime(vault, vaultRoot)
       ├── createRuntime({ vault, vaultRoot })       ← packages/core/src/runtime.ts
       │     └── builds { commands, events, config, xp, rituals, plugins }
       ├── runtime.load()                            ← reads config + warms plugin state (xp loads async in the background)
       ├── loadBuiltInPlugins(runtime)               ← apps/console/src/boot/built-in-plugins.ts
       │     └── import.meta.glob("../../../../plugins/*/main.js")
       │     └── runtime.plugins.addStaticPlugin({ id, pluginClass })
       ├── initShell(runtime)                        ← apps/console/src/shell/index.ts
       │     ├── registerCoreCommands
       │     ├── initTheme / initClock / initNav
       │     ├── initCmdbar / initStatusline / initTweaks
       │     ├── initHomeGreeting / initSettings
       │     └── initMountPoints                     ← paints plugin views into the right screen sections
       ├── ritual cron tick (60 s interval)
       └── initGlobalShortcut(config.globalShortcut)
```

## Module map

- **`apps/console/`** — the webview UI. Vanilla DOM + TypeScript (no React/Lit/etc). The HTML mock lives in `index.html` and shell modules overwrite dynamic regions.
- **`src-tauri/`** — Rust backend. Exposes IPC commands for vault FS and window title, owns the global shortcut and dialog plugins.
- **`packages/sdk/`** — plugin authoring contract. Types only, no runtime. This is the stable surface a plugin author should read.
- **`packages/core/`** — runtime that fulfils the SDK contract. Command registry, event bus, config store, XP store with snapshot + async replay, cron + ritual system, plugin loader.
- **`plugins/`** — built-in plugins (`tasks`, `journal`, `habits`) plus the `template` starter. Plain JavaScript with JSDoc types that reference `@atlas/sdk`.

## What's "trusted code" vs "data"

Everything under `packages/`, `apps/console/src/`, `src-tauri/`, and `plugins/` is **trusted code** — it runs with the full privileges of the webview or Rust host. The **vault** (the folder the user picks at onboarding) is **data** — the app reads it, writes it, and never executes it.

## Extension points

New plugins land in `plugins/<id>/`. See [`PLUGIN_API.md`](./PLUGIN_API.md) for the interface a plugin must implement. See [`CONTRIBUTING.md`](../CONTRIBUTING.md#plugin-trust-model) for the security model.

New screens should be registered by a plugin via `ctx.ui.registerView(screenId, loader)` plus `ctx.nav.register({ id, label, group })`. The shell then mounts the view into the matching `<section id="scr-<id>">` at activation time.
