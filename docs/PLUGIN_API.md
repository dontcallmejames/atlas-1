# Plugin API Reference

The complete surface a plugin author needs. Every type below is exported from `@atlas/sdk`.

An Atlas plugin is a directory under `plugins/<id>/` with a `main.js` that default-exports a class implementing [`Plugin`](#plugin). At load time, the core constructs an instance, calls `onload(ctx)` with a [`PluginContext`](#plugincontext), and keeps the instance alive until shutdown, when `onunload(ctx)` is called.

## Plugin

```ts
interface Plugin {
  onload(ctx: PluginContext): void | Promise<void>;
  onunload?(ctx: PluginContext): void | Promise<void>;
}
```

Default-export a class implementing this from your plugin's `main.js`. The runtime instantiates it once per app lifetime.

| Member | Purpose |
|--------|---------|
| `onload(ctx)` | Called once after the plugin instance is constructed. Register commands, views, nav items, and event listeners here. May be async. The ctx is the only way to touch the runtime — do not import core modules directly. |
| `onunload?(ctx)` | Called once at shutdown. Optional. Release external resources (timers, fetch aborts, `window` DOM listeners). Disposers returned by `commands.register`, `nav.register`, `ui.registerView` are invoked automatically — you do not need to unregister them here. |

## PluginContext

Passed to `onload`. Exposes seven capability APIs.

| Field | Type | Purpose |
|-------|------|---------|
| `pluginId` | `string` | Your plugin id as declared in `manifest.json`. Used for namespacing. |
| `vault` | [`VaultFs`](#vaultfs) | Filesystem scoped to `plugins/<pluginId>/` inside the vault. |
| `commands` | [`CommandApi`](#commandapi) | Register, unregister, and invoke slash commands. |
| `events` | [`EventApi`](#eventapi) | Subscribe to and emit typed app-wide events. |
| `xp` | [`XpApi`](#xpapi) | Award XP and read HUD state (hp/nrg/focus/streak/level). |
| `nav` | [`NavApi`](#navapi) | Add entries to the screen navigation. |
| `ui` | [`UiApi`](#uiapi) | Register views for named screens. |

> **Note on `ctx.vault`:** the scoped root is **defence-in-depth, not a sandbox** — the Node-side implementation only normalises paths. Plugins run with full webview privileges. See [`CONTRIBUTING.md`](../CONTRIBUTING.md#plugin-trust-model).

## CommandApi

Command registry. Accessed via `ctx.commands` from a plugin, or directly from core.

| Member | Purpose |
|--------|---------|
| `register(command)` | Register a command. Returns a disposer that unregisters it. Plugins do not normally need to call the disposer — the runtime disposes all plugin-registered commands automatically on unload. |
| `unregister(id)` | Remove a command by its final (namespaced) id. |
| `invoke(id, args?)` | Invoke a command by its final id, passing optional positional args. Returns `Promise<void>`. |
| `list()` | List every registered command. |
| `has(id)` | Whether a command with the given final id is registered. |

### Command

```ts
interface Command {
  id: string;
  hint?: string;
  run: (args: string[]) => void | Promise<void>;
}
```

| Field | Purpose |
|-------|---------|
| `id` | For plugin commands, register the bare verb (e.g. `"add"`) — the runtime prefixes it with `<pluginId>.` to produce the final id (`"<pluginId>.add"`). Do not include a dot yourself; an error is thrown if you try. Core commands are unprefixed (e.g. `"go"`). |
| `hint?` | One-line description shown in the command-bar autocomplete. |
| `run(args)` | The implementation invoked when the command fires. Receives positional args parsed from the command bar. May be async. |

### ParsedCommand

Result of parsing a raw command-bar line. Emitted by the command-bar parser.

| Field | Purpose |
|-------|---------|
| `id` | Namespaced id, e.g. `"tasks.add"` or `"go"`. |
| `args` | Positional args after the id. |
| `raw` | The raw input, minus the leading slash if any. |

## EventApi

Event bus. Accessed via `ctx.events` from a plugin. Synchronous fan-out.

| Member | Purpose |
|--------|---------|
| `on(event, listener)` | Subscribe to an event. Returns a disposer that unsubscribes. Disposers are called automatically when the plugin is unloaded. |
| `off(event, listener)` | Unsubscribe a specific listener previously passed to `on`. |
| `emit(event, payload)` | Emit an event to every subscribed listener. Synchronous fan-out. |

### EventMap

The core seeds a single event:

| Key | Payload | Purpose |
|-----|---------|---------|
| `"app:ready"` | `void` | Emitted once after all built-in plugins finish `onload`. |

**Augmenting for your own events:** plugins should add strongly-typed events via TypeScript module augmentation:

```ts
declare module "@atlas/sdk" {
  interface EventMap {
    "tasks:completed": { id: string };
  }
}
```

Listeners and emitters are then typechecked against the augmented map.

## VaultFs

Plain-text vault filesystem. Paths are POSIX-style (forward slashes); traversal (`..`) is rejected. From `ctx.vault` paths resolve inside `plugins/<pluginId>/`; from core they resolve from the vault root.

| Member | Purpose |
|--------|---------|
| `read(path)` | Read a UTF-8 text file. Rejects if the file does not exist. |
| `write(path, content)` | Write (create or overwrite) a UTF-8 text file. Creates parent dirs. |
| `append(path, content)` | Append UTF-8 text to a file, creating it (and parents) if absent. |
| `list(path)` | List the immediate children of a directory. Returns names only (no path prefix). Rejects if the path is not a directory. |
| `exists(path)` | Whether a file or directory exists at the given path. |
| `remove(path)` | Remove a file. Rejects on directories and on missing files. |

`VaultPath` is just `string` — POSIX-style relative path, never absolute.

## XpApi

XP / HUD API. Accessed via `ctx.xp` from a plugin.

> When `gameMode: false` is set in `AtlasConfig`, `award` is a no-op — the ledger is not written and listeners are not notified.

| Member | Purpose |
|--------|---------|
| `award(input)` | Award an XP delta. `amount` may be negative (for penalties). `kind` defaults to `"xp"`; pass `"hp" \| "nrg" \| "focus"` to move another stat. No-op when `gameMode` is disabled. |
| `getState()` | Read the current HUD state snapshot. |
| `onChange(listener)` | Subscribe to state changes. Fires after every `award` that mutates state. Returns a disposer. |

### XpEvent

One XP ledger entry. Appended to `.atlas/xp.log` on each `award`.

| Field | Purpose |
|-------|---------|
| `ts` | ms since epoch. |
| `source` | Plugin id or `"core"`. |
| `delta` | Positive or negative delta. |
| `reason` | Short human-readable reason, e.g. `"completed task"`. |
| `kind?` | Which stat moved: `"xp"` (default), `"hp"`, `"nrg"`, `"focus"`. |

### XpState

Snapshot of the HUD game state derived from the XP ledger.

| Field | Purpose |
|-------|---------|
| `xp` | Total lifetime XP. |
| `lvl` | Current level, computed from `xp` and `xpPerLevelBase` config. |
| `hp` | Health points (0–100). |
| `nrg` | Energy points (0–100). |
| `focus` | Focus points (0–100). |
| `streak` | Current consecutive-day streak based on daily XP events. |

## NavApi

Register entries in the app's screen navigation.

| Member | Purpose |
|--------|---------|
| `register({ id, label, icon?, group? })` | Register a nav item. `id` must be unique across plugins; `label` is the visible text; `icon` is an optional glyph/URL; `group` optionally slots the item under a named section. Returns a disposer that removes it. |

## UiApi

Register lazy-loaded views for named screens.

| Member | Purpose |
|--------|---------|
| `registerView(screenId, loader)` | Register a view loader for a screen. `screenId` is the target screen (e.g. `"tasks"`); `loader` is an async factory that resolves to a view module. By convention the loaded module exposes `{ render(el: HTMLElement): void; dispose?(): void }`. Returns a disposer that unregisters the view. |

## PluginManifest

Shape of `plugins/<id>/manifest.json`. The loader validates this file before instantiating the plugin.

| Field | Purpose |
|-------|---------|
| `id` | Stable id, also the directory name. Matches `/^[a-z][a-z0-9_-]{1,31}$/`. |
| `name` | Human-readable name shown in Settings. |
| `version` | Semver string for this plugin release. |
| `author?` | Optional author attribution. |
| `atlas` | Semver range of the Atlas core this plugin targets (e.g. `"^0.10.0"`). |
| `main` | Entry file relative to the plugin directory, usually `"main.js"`. |
| `permissions?` | Advisory permission strings (e.g. `"vault:plugins/<id>"`). |

## Writing your first plugin

```bash
pnpm new:plugin hello-world
```

Then edit `plugins/hello-world/main.js`. The template is ~40 lines and shows commands, XP, vault writes, and event subscriptions. For fuller patterns see the three built-in plugins (`plugins/tasks`, `plugins/journal`, `plugins/habits`).
