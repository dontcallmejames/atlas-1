# Atlas 1 — v1 Design Spec

_Status: Draft · Date: 2026-04-19_

## Overview

Atlas 1 is a local-first, forkable "life console" — a terminal × game-HUD dashboard for managing calendar, hobbies, health, work, play, and AI projects. It is distributed as an open-source Tauri desktop app that reads and writes a user-owned plain-text vault. Every feature is implemented as a plugin; built-in modules use the same SDK that third-party forkers use.

The prototype at `index.html` + `console.css` is the visual reference. v1 recreates its look and interaction model as a real app, with a minimal but complete plugin system and three dogfooded built-in plugins.

## Goals

- Ship a working desktop app that anyone can fork, rename, and make their own.
- Prove the plugin API by building the three v1 modules against it with no privileged access.
- Keep user data in a plain-text vault the user owns and can sync, back up, or grep.
- Preserve the prototype's terminal × game-HUD feel: keyboard-first REPL, CRT theme, XP/stats layer.
- Lean into differentiators that fall out of the command-first + plain-text-vault architecture: plain-text ritual scripts and a system-wide global shortcut.

## Non-Goals (v1)

Deferred to v2+, tracked in the Roadmap section below:

- Cloud sync, mobile apps, multi-vault.
- Plugin sandboxing or permission enforcement.
- Central plugin registry.
- Calendar, Health, and GitHub/Projects integrations.
- Encryption-at-rest.
- Live agents (the `scraper` / `sleep-coach` / `inbox-triage` dots remain decorative placeholders).
- Auto-derived vitals (HP/NRG/FOCUS come from manual check-ins in v1).

## Runtime & Stack

- **Shell:** Tauri 2.x. Rust backend owns the window, file dialogs, and vault FS access via IPC commands. All app logic lives in the webview.
- **Frontend:** Lit 3 + web components. No required build step for plugin authors. `apps/console` is a Vite-based TypeScript project for internal code.
- **Package manager:** pnpm workspaces.
- **Target platforms:** macOS (arm64 + x64), Windows x64, Linux x64 (AppImage + deb).

## Repository Layout

```
atlas-1/
├── src-tauri/                    # Rust: vault FS ops, dialogs, IPC
│   ├── src/
│   └── tauri.conf.json
├── apps/
│   └── console/                  # Lit frontend (the webview)
│       ├── index.html            # refactored from the prototype
│       ├── src/
│       │   ├── shell/            # chrome, statusline, nav, command-bar
│       │   ├── repl/             # parser, history, autocomplete
│       │   ├── theme/            # CSS vars, CRT, tweaks panel
│       │   ├── onboarding/       # boot wizard steps
│       │   ├── settings/         # settings screen
│       │   └── main.ts
│       └── console.css
├── packages/
│   ├── sdk/                      # @atlas/sdk — types + helpers for plugin authors
│   ├── core/                     # plugin loader, command registry, vault adapter, event bus, XP store
│   └── ui/                       # shared Lit components (stat-bar, pane, ascii-banner, etc.)
├── plugins/                      # built-in v1 plugins
│   ├── tasks/
│   ├── journal/
│   └── habits/
├── docs/
└── pnpm-workspace.yaml
```

Rules:
- `packages/sdk` is the stable, versioned, documented authoring surface.
- `packages/core` is the runtime; plugins never import from it.
- Built-in plugins in `plugins/` use the same SDK a forker uses — no back doors.

## Vault Layout

User chooses the vault path during onboarding. Structure:

```
<vault>/
├── .atlas/
│   ├── config.json               # name, theme, accent, CRT, density, font, game-mode, global-shortcut
│   ├── plugins.json              # installed plugins + enabled + versions
│   ├── plugins/                  # third-party plugins dropped in here
│   ├── rituals/                  # user's ritual scripts (*.atlas)
│   ├── keybindings.json          # user-editable
│   ├── state.json                # last screen, REPL history, onboarded flag
│   └── xp.log                    # append-only JSONL ledger of XP/stat events
├── tasks/
│   ├── inbox.md                  # `- [ ] buy milk  ^id-abc`
│   ├── projects/<name>.md
│   └── archive/YYYY-MM.md
├── journal/
│   ├── YYYY/MM/YYYY-MM-DD.md     # daily notes
│   └── templates/daily.md
├── habits/
│   ├── habits.yaml               # habit definitions
│   └── log/YYYY-MM.jsonl         # append-only daily log
└── README.md                     # user's own file — Atlas never writes here
```

Design calls:
- `.atlas/` holds all instance config; the rest is user-owned data.
- Each plugin owns one top-level subfolder matching its id.
- Markdown where it reads naturally; JSONL for time-series (append-only, diff-friendly); YAML for human-edited config.
- File IDs use the trailing `^id-xxx` convention for stable refs across edits.
- Uninstalling a plugin does not delete its data folder.
- Vault is git-friendly; Atlas writes only text files.

## Plugin System

### Plugin folder shape

```
<plugin-id>/
├── manifest.json
├── main.js                       # default export: Plugin class
├── schema.json                   # optional — JSON Schema for vault files
├── ui/                           # optional — Lit components
└── README.md
```

### Manifest

```json
{
  "id": "tasks",
  "name": "Tasks",
  "version": "0.1.0",
  "author": "atlas",
  "atlas": ">=0.1.0",
  "main": "main.js",
  "permissions": ["vault:read", "vault:write", "commands", "nav"]
}
```

Permissions are declared in v1 but not enforced. The trust model is read-the-source + explicit install confirmation. Enforcement is a v2 concern.

### Lifecycle

```js
export default class TasksPlugin {
  async onload(ctx) { /* register commands, nav, views, statusline */ }
  async onunload(ctx) { /* clean up subscriptions */ }
}
```

### SDK surface (`ctx`)

- `ctx.vault` — `read / write / append / list / watch`, scoped to the plugin's own subfolder by default. Broader access requires an explicit permission.
- `ctx.commands` — `register / invoke / unregister`. Commands are namespaced as `<plugin>.<verb>`.
- `ctx.nav` — register a screen tab (id, label, icon, group).
- `ctx.ui` — register Lit views (lazy-imported), statusline segments, tweaks-panel widgets.
- `ctx.events` — pub/sub across plugins (e.g. `tasks:completed` → habits awards XP). Plugins never import each other.
- `ctx.settings` — schema-driven settings; auto-rendered in Settings → Plugins → `<id>`.
- `ctx.xp` — `award({ amount, reason })`. No-ops when game mode is off.
- `ctx.theme` — read current tokens; register a theme pack.

### Rules

1. **Scoped vault by default.** A plugin only sees its own subfolder unless granted more.
2. **No privileged core.** Built-in plugins use the same `ctx` forkers get.
3. **Events, not imports.** Cross-plugin coordination goes through `ctx.events`.
4. **Lazy UI.** Views import on first nav.
5. **TypeScript is optional.** SDK ships `.d.ts`; plain-JS plugins are first-class.

## REPL & Command System

Every user action is a command. UI buttons and keybinds are sugar over `commands.invoke(id, args)`.

### Command shape

```js
{
  id: 'task.add',
  hint: '/task add <text>',
  args: [{ name: 'text', type: 'string', rest: true }],
  keybind: 'mod+shift+a',
  run: async (ctx, args) => { ... }
}
```

### Parser

- Slash-prefixed, space-tokenized, quoted strings preserved.
- `/task add buy milk` → `task.add` with `{ text: "buy milk" }`.
- Subcommands are dots: `task.done`, `task.archive`.

### Command bar

- Bottom of screen; `/` focuses from anywhere.
- Empty → recent + suggested.
- Typing filters; Tab completes; Enter runs; Up/Down cycles history; Esc blurs.
- Commands may return toast results or stream output into the REPL panel.

### Built-in core commands

- `go <screen>` — nav.
- `theme <light|phosphor>`, `accent <hex>`, `crt <on|off>`, `density <comfy|compact>`.
- `vault open`, `vault reveal`.
- `plugin install <path|url>`, `plugin enable <id>`, `plugin disable <id>`.
- `ritual run <name>`, `ritual list`, `ritual edit <name>` — see Rituals below.
- `settings`, `help`, `?`.

## Rituals

A ritual is a plain-text sequence of commands stored in the vault. It is the primary scripting primitive and is a first-class v1 feature.

### Shape

```
<vault>/.atlas/rituals/<name>.atlas
```

File contents are one command per line, `#` for comments, blank lines ignored:

```
# morning.atlas — run on first launch of the day
/journal new
/tasks show today
/habits checkin
/vitals checkin
```

### Execution

- `/ritual run morning` executes the file top-to-bottom, streaming each command's output into the REPL panel.
- A ritual runs commands through the same `commands.invoke` path a user would — no privileged execution. If a user can't do it by typing, a ritual can't either.
- Failures are non-fatal by default: a failed line logs an error and the ritual continues. `# @halt-on-error` directive at the top changes this.
- Arguments: `/ritual run morning --date=2026-04-19` — accessible inside the file as `$date`.

### Triggers

- **Manual:** typed or bound to a keybind.
- **Time:** `# @cron 0 8 * * *` at the top of the file registers a cron trigger (evaluated in-app; no system cron needed).
- **Event:** `# @on app:open` runs on the matching `ctx.events` event.

All triggers are opt-in per file and visible in Settings → Rituals.

### Authoring surface

- Plugins can register ritual templates by dropping files in `<plugin>/rituals/*.atlas`. On first enable, templates are copied into the vault where the user can edit them freely.
- A built-in `morning.atlas` and `evening.atlas` ship as examples.

### Out of scope for v1

- Conditionals, loops, variables beyond `$args`. A ritual is a linear script in v1. Anything more complex is a plugin command.

## Global Shortcut

Atlas registers a system-wide keyboard shortcut (default: `Cmd/Ctrl+Shift+Space`) via the Tauri `global-shortcut` plugin.

- Pressing it from any app focuses (or launches + focuses) Atlas and opens the command bar with the cursor ready.
- The shortcut is rebindable in Settings → Keybindings and can be disabled.
- Rationale: makes Atlas viable as a quick-capture surface for tasks/journal entries without leaving the current app — Raycast-style parity on a life OS.
- Implementation note: shortcut registration is wired in the Rust side (`src-tauri`), not the webview.

### Keybindings

- `.atlas/keybindings.json` is user-editable.
- Plugins suggest defaults at command registration; user's file wins on conflict.

## Theming, Stats & Game Layer

### Theming

- CSS custom properties drive everything; `console.css` already defines the tokens.
- Tokens: `--paper`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-green`, `--accent-3`, `--font-mono`, `--font-hand`, `--rule`, `--density`.
- Themes are selectors: `[data-theme="phosphor"] { ... }`. CRT is a `body.crt` overlay.
- Plugins must read tokens, never hard-code colors.
- Plugins can register a **theme pack** (a CSS file scoped to `[data-theme="<id>"]`).

### Stats store

- Canonical stats: `HP`, `NRG`, `FOCUS`, `XP`, `LVL`, `streak`.
- Persisted as append-only JSONL in `.atlas/xp.log`. Each line: `{ ts, source, delta, reason, kind }`.
- Live state is a reduction over the log. Easy to audit, replay, and undo.
- Level curve configurable in `config.json` (default: `xp_per_level = 500 * lvl`).

### Game layer toggle

- `config.game_mode: on | off`.
- When off: XP/LVL/streak chrome is hidden everywhere; `ctx.xp.award(...)` no-ops.
- Plugins can always call `ctx.xp` safely — the store handles the toggle.

### Vitals in v1

- HP/NRG/FOCUS are manual: `/vitals set hp 78`, `/vitals checkin`.
- Auto-derivation from sleep/habits is a v2 concern.

### Tweaks panel

- Floating bottom-right, toggled from chrome.
- Binds directly to `config.json`: name, theme, accent, density, font, CRT, game-mode.
- Changes instant and persistent.

## Onboarding

Six-step boot flow on first launch (no `config.name` present):

1. **Name your instance** — suggestions shown; writes `config.name`.
2. **Pick your class** — one of 6 loadouts. A class is a preset bundle of enabled plugins + default accent + a starting XP modifier. All user-overridable.
3. **Enable modules** — checkbox list of installed plugins.
4. **Theme & feel** — mode, accent, density, font, CRT.
5. **Pick vault path** — Tauri file dialog. Atlas initializes `.atlas/` and each plugin's folder skeleton.
6. **Ready** — summary card and first-things-to-try; "BOOT ATLAS·1" sets `state.onboarded = true` and routes to home.

Subsequent launches with `state.onboarded === true` skip straight to home.

## Distribution

- **Binaries** via GitHub Releases. CI runs `tauri build` for the three target platforms on tag push. Signed where affordable.
- **Build-from-source** is first-class. README has a 4-command path: `pnpm i`, `pnpm dev` (webview only), `pnpm tauri dev` (full app), `pnpm tauri build`.
- **Plugin distribution (v1):**
  - `git clone` into `<vault>/.atlas/plugins/`.
  - Drag-drop a folder onto Settings → Plugins.
  - No central registry. The repo README lists curated community plugins.
- A plugin registry ships later as its own plugin.

## Testing Strategy

- **`packages/core` + `packages/sdk`:** Vitest unit tests. Command parser, vault FS adapter (against tmp dirs), event bus, XP reducer, config loader.
- **Built-in plugins:** each has Vitest tests that exercise it through the public SDK. These double as SDK-contract tests — if a plugin test breaks after an SDK change, that is the signal.
- **Shell:** Playwright smoke test covering boot → `/go tasks` → screen switches. No exhaustive UI coverage in v1; visual polish is caught by dogfooding.
- **CI:** GitHub Actions. `pnpm test` on every push; `tauri build` on the three platforms on tag.

## Milestones

1. **M1 — Skeleton.** Tauri app boots, loads `apps/console`, renders the prototype as-is from `index.html` + `console.css`. No plugins. No REPL yet.
2. **M2 — Core + SDK.** Command registry, vault adapter, event bus, XP store, config loader. Unit-tested. Plugin loader reads `.atlas/plugins.json` and calls `onload` for enabled plugins.
3. **M3 — Shell wiring.** Nav, statusline, command bar, tweaks, theme toggle driven by core. Onboarding flow persists to `config.json`.
4. **M4 — Tasks plugin.** First real plugin; dogfoods the SDK and flushes out rough edges.
5. **M5 — Journal + Habits plugins.** Three modules total.
6. **M6 — Rituals + global shortcut.** Ritual runner, cron/event triggers, Settings → Rituals, system-wide shortcut wired in Rust.
7. **M7 — Settings screen.** Plugin enable/disable, keybindings, identity, appearance, about.
8. **M8 — Distribution.** CI, release workflow, install docs, forker's README.

## Open Questions (to resolve during implementation)

- Exact shape of `ctx.vault.watch` — chokidar-in-Rust vs. polling vs. Tauri file-system-watch plugin.
- Whether `keybindings.json` uses VS Code-style strings (`"ctrl+shift+a"`) or a more structured format.
- Plugin hot-reload in dev: watch `plugins/` and re-invoke `onload/onunload` without full app restart.
- Tauri v2 plugin for global shortcuts vs. in-webview keybinds only.

## Roadmap (v2+, not in scope but do-not-forget)

- **AI agents as plugins.** Agents are plugins that subscribe to `ctx.events` and stream output into the REPL. No vendor lock, no dedicated "AI" tab — just plugins. Example: a `morning-briefing` agent that listens for `app:open`, reads vault, streams a summary.
- **Time-travel / replay.** The `xp.log` is append-only. Surface `/replay <when>` and `/diff <range>` to reduce the log to any timestamp and render stats as-of that moment. Data model already supports this; it's a UI + reducer feature.
- **Vault as a git repo — clone your life.** If the user runs `git init` inside the vault, Atlas respects it. A first-class doc pattern: new machine → `git clone <your-vault> && pnpm tauri dev`. Gives point-in-time restore and cross-device sync for free via any git host.
- **Quest engine on top of tasks.** Upgrade Tasks so tasks can declare prerequisites and rewards, forming DAGs — main/side/daily quests with branches. Leans into the game metaphor as a real primitive rather than decoration.
- **Ritual scripting upgrades.** Conditionals, loops, variables, piping command output into the next line. v1 is linear-only by design.
- **Cloud sync** (Atlas-hosted optional service, or user-provided WebDAV/S3).
- **Mobile** — read-only companion first, then capture/quick-add.
- **Plugin sandbox** — iframe/worker isolation, real permission enforcement, two-tier trust model.
- **Plugin registry** — central discovery, install-by-URL with signature checks.
- **Calendar module** — iCal / CalDAV sync.
- **Health module** — Apple Health / Google Fit sync, auto-derived HP/NRG/FOCUS.
- **Projects module** — GitHub API, multi-repo activity, PR/issue triage.
- **Agents** — real inbox-triage / sleep-coach / scraper / news-digest agents with streaming output into the REPL.
- **Auto-derived vitals** from sleep + habits + workout data.
- **Encryption-at-rest** for the vault; per-plugin secret storage.
- **Multi-vault** — switch between personal/work/etc.
- **Responsive / mobile-sized layout** of the console.
- **Command-bar autocomplete with fuzzy matching** (v1 is prefix-match).
- **Empty states** for 0 quests, 0 hobbies, brand-new vault.
- **Pomodoro / focus-block module** (referenced in prototype, not drawn).

## Success Criteria for v1

- A user can clone the repo, run `pnpm tauri dev`, complete onboarding, and have a working instance in under 5 minutes.
- Tasks, Journal, and Habits are each useful enough that the author (primary user) uses them daily for two weeks without hitting a blocker.
- A forker can write a new plugin by reading only `packages/sdk` docs + one built-in plugin as a reference, with no need to read `packages/core`.
- The vault is readable and editable with `vim` or `code`, and survives a round-trip through git without conflicts on single-user edits.
