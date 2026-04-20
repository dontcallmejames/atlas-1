# M12 — Perf Cleanup + Forker Docs (Tier 3 Group D + F)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Knock out 5 tech-debt rows (Tier 3 #13, #14, #15, #18, #19) in one milestone — drop ~130 kB from the bundle, get XP boot off the critical path, kill the fake "alex/" demo data, and ship the two architecture docs new forkers actually need.

**Architecture:** Five independent tasks with no cross-coupling. Each one is a single-commit unit. Two perf refactors (xp snapshot + habits parser), one HTML strip, two docs files, one lockfile hygiene pass.

**Tech Stack:** TypeScript + vanilla JS (no new deps; one dep *removed*).

---

## File Structure

**Create:**
- `docs/ARCHITECTURE.md` — 400-word boot flow + module map with a text call-graph
- `docs/PLUGIN_API.md` — flattened reference across the 6 SDK files

**Modify:**
- `apps/console/index.html` — strip demo content from the non-plugin screens (`#scr-health`, `#scr-ailab`, `#scr-hobbies`); remove fake `alex/*` references; keep home + plugin screens (`#scr-tasks`, `#scr-journal`, `#scr-habits`) + boot + settings
- `plugins/habits/parser.js` — replace `js-yaml` with a 30-line parser for the flat habits schema
- `plugins/habits/package.json` — drop `js-yaml` from dependencies
- `plugins/habits/main.js` — update read/write paths to use the new parser
- `plugins/habits/parser.test.js` — update any test that imported `js-yaml` directly (unlikely; parser is local)
- `packages/core/src/xp/xp-store.ts` — add `.atlas/xp-state.json` snapshot; make `load()` fast-path on snapshot and replay tail async; expose `loaded()` Promise
- `packages/core/src/xp/xp-store.test.ts` — tests for snapshot round-trip + tail-replay correctness
- `packages/core/src/runtime.ts` — no longer `await xp.load()` on boot critical path; kick it off async
- `apps/console/package.json` — delete `lit` from dependencies (not imported anywhere)
- `apps/console/src/boot/built-in-plugins.ts` — validate plugin id against `/^[a-z][a-z0-9_-]{0,31}$/`; refuse to load on mismatch
- `packages/core/src/plugins/plugin-loader.ts` — same regex on `addStaticPlugin` and the on-disk loader
- `docs/TECH-DEBT.md` — flip rows #13, #14, #15, #18, #19 from 🔴 to 🟢
- `README.md` — one-sentence link to `docs/ARCHITECTURE.md` and `docs/PLUGIN_API.md`

**Out of scope:**
- Home/health/ailab/hobbies screens getting real rendering — tracked separately; this plan only strips the most egregious fake data.
- js-yaml → custom parser for anything beyond `habits.yaml` — we don't parse user YAML anywhere else.
- XP log compaction (merging old events into the snapshot) — snapshot + replay is enough; full compaction can land later if the log gets huge.

---

## Task 1: Strip demo markup from non-plugin screens (#13)

**Files:**
- Modify: `apps/console/index.html`

**Scope:** the three "design mock" screens (`#scr-health`, `#scr-ailab` / Projects, `#scr-hobbies`) each contain ~200-400 lines of hardcoded fake data (fake repos "alex/agent-eval-v3", specific vitals numbers, hardcoded habit streaks, piano heatmaps). They are not wired to any plugin. Replace each with a minimal "coming soon" panel that matches the terminal × game-HUD aesthetic.

**Do NOT touch:**
- `#scr-home` — home has real dynamic pieces (greeting, statusline, nav). Strip only the obviously-fake inline repo lists and user-specific content; keep the layout skeleton.
- `#scr-boot` — onboarding wizard is live code.
- `#scr-settings` — settings router renders into this.
- `#scr-tasks`, `#scr-journal`, `#scr-habits` — plugin views paint here.

- [ ] **Step 1: Measure baseline**

Run: `wc -c apps/console/index.html`

Expected: ~100 kB. Record the number for the commit message.

- [ ] **Step 2: Strip `#scr-health`**

Find the section with `id="scr-health"`. Replace its inner content (everything between the opening `<section>` and closing `</section>`) with:

```html
<div class="screen-empty">
  <div class="term-grid">
    <aside class="pane">
      <div class="pane-hdr"><span>~/health</span><span class="nn">[1]</span></div>
      <div class="pane-body">
        <div class="section-title">STATUS</div>
        <div style="font-size:11px; color:var(--muted); line-height:1.6;">
          no health plugin loaded.<br><br>
          the health module is a placeholder. wire an integration by writing
          a plugin that registers a <code>health</code> screen view.<br><br>
          see <code>plugins/template/</code> for the starter.
        </div>
      </div>
    </aside>
    <main class="pane" style="border-right: var(--rule) solid var(--line);">
      <div class="pane-hdr"><span>~/health/detail</span><span class="nn">[2]</span></div>
      <div class="center-scroll">
        <div style="padding: 40px 20px; font-size: 13px; color: var(--muted); line-height: 1.8;">
          <div style="font-size: 18px; color: var(--ink); margin-bottom: 12px;">┌ no data ┐</div>
          install a health plugin to populate this screen.
        </div>
      </div>
    </main>
    <aside class="pane">
      <div class="pane-hdr"><span>~/health/side</span><span class="nn">[3]</span></div>
      <div class="pane-body"></div>
    </aside>
  </div>
</div>
```

- [ ] **Step 3: Strip `#scr-ailab` (Projects)**

Same treatment as Step 2. Header label becomes `~/projects`, body copy says "install a projects plugin (e.g., a GitHub activity viewer) to populate this screen."

Note: the nav button still says `data-scr="ailab"` — DO NOT rename that id in this task (it would cascade to core-commands.ts, nav.ts, and break muscle memory). Leave the id alone; only the content changes. Update the `data-screen-label="Projects"` attribute if you want, but the internal id stays `ailab`.

- [ ] **Step 4: Strip `#scr-hobbies`**

Same treatment. Header `~/hobbies`, body copy "install a hobbies plugin to track piano, reading, workouts, etc."

- [ ] **Step 5: Clean fake names from `#scr-home`**

Search for `alex` (case-insensitive) within `#scr-home` only. Replace repo names like `alex/agent-eval-v3` with generic `~/repo-name`, or delete the whole "RECENT REPOS" section if it's purely decorative. Use judgement — preserve the layout rhythm; delete only content that is obviously fake placeholder data.

Do NOT touch other elements of home that have dynamic hooks:
- `.greet-line .hand` — overwritten by `home.ts`
- `.statusline` — overwritten by `statusline.ts`
- `#clockStr` — overwritten by `clock.ts`

- [ ] **Step 6: Remove any remaining `alex` references**

Run: `grep -i "alex" apps/console/index.html`

Expected: zero hits. If any remain (e.g., in boot banners or settings copy), replace with generic text.

- [ ] **Step 7: Verify all screens still render**

Run: `pnpm typecheck && pnpm build`

Expected: clean build. HTML is part of the Vite build; errors here mean malformed markup.

Run: `wc -c apps/console/index.html`

Expected: meaningfully smaller than the baseline (~20-30 kB drop minimum, more if the ailab + hobbies screens were dense).

- [ ] **Step 8: Commit**

```bash
git add apps/console/index.html
git commit -m "perf(ui): strip demo content from non-plugin screens (~XX kB drop)"
```

(Replace XX with the actual kB drop measured in Step 7.)

---

## Task 2: Replace `js-yaml` in habits with a hand parser (#14)

**Files:**
- Modify: `plugins/habits/parser.js`
- Modify: `plugins/habits/package.json`
- Modify: `plugins/habits/parser.test.js` (only if it imports js-yaml directly)

**Why:** The habits plugin pulls `js-yaml` just to parse `habits.yaml`, a user-authored file with a single shape: `habits: [{ id, name, xp }]`. Replace with a minimal hand parser + JSON.stringify-style writer, drop the dep.

- [ ] **Step 1: Read the current `parser.js`**

Locate the js-yaml import and the two functions it enables (likely `parseHabitsYaml` and `serializeHabitsYaml`).

- [ ] **Step 2: Write failing tests for the new parser first**

If `parser.test.js` doesn't already cover these, add:

```js
import { describe, it, expect } from "vitest";
import { parseHabits, serializeHabits } from "./parser.js";

describe("habits parser (no js-yaml)", () => {
  it("parses the canonical habits.yaml shape", () => {
    const yaml = `habits:
  - id: workout
    name: Workout
    xp: 30
  - id: read
    name: Read 20 min
    xp: 10
`;
    const result = parseHabits(yaml);
    expect(result).toEqual([
      { id: "workout", name: "Workout", xp: 30 },
      { id: "read", name: "Read 20 min", xp: 10 },
    ]);
  });

  it("round-trips parse → serialize → parse", () => {
    const habits = [
      { id: "meditate", name: "Meditate", xp: 15 },
      { id: "walk", name: "Evening walk", xp: 10 },
    ];
    const yaml = serializeHabits(habits);
    expect(parseHabits(yaml)).toEqual(habits);
  });

  it("tolerates blank lines and trailing whitespace", () => {
    const yaml = `habits:
  - id: a
    name: A
    xp: 5

  - id: b
    name: B
    xp: 7
`;
    expect(parseHabits(yaml)).toEqual([
      { id: "a", name: "A", xp: 5 },
      { id: "b", name: "B", xp: 7 },
    ]);
  });

  it("throws on missing top-level habits key", () => {
    expect(() => parseHabits("# nothing\n")).toThrow();
  });
});
```

Run: `pnpm --filter @atlas-plugin/habits test`

Expected: failures if the new function names don't exist yet. If the existing parser exports different names (like `parseHabitsYaml`), rename the imports in tests accordingly — the goal is to drop js-yaml, not rename the public API.

- [ ] **Step 3: Implement the hand parser**

Replace the js-yaml-based implementation with something like:

```js
/**
 * Parse a habits.yaml file with the canonical flat shape:
 *   habits:
 *     - id: <slug>
 *       name: <string>
 *       xp: <integer>
 *
 * Tolerates blank lines and trailing whitespace. Does NOT support nested
 * keys, lists of strings, multiline strings, anchors, or any other YAML
 * feature. If we ever need those, switch back to js-yaml.
 */
export function parseHabits(text) {
  const lines = text.split(/\r?\n/);
  let i = 0;
  // Skip leading blanks / comments
  while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith("#"))) i++;
  if (i >= lines.length || !lines[i].match(/^habits\s*:\s*$/)) {
    throw new Error("habits.yaml must start with 'habits:' top-level key");
  }
  i++;
  const habits = [];
  let current = null;
  while (i < lines.length) {
    const line = lines[i];
    i++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const dashMatch = line.match(/^\s*-\s*id\s*:\s*(.+)$/);
    if (dashMatch) {
      if (current) habits.push(current);
      current = { id: dashMatch[1].trim() };
      continue;
    }
    const kv = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
    if (kv && current) {
      const key = kv[1];
      const val = kv[2].trim();
      if (key === "xp") current[key] = Number(val);
      else current[key] = val;
    }
  }
  if (current) habits.push(current);
  return habits;
}

/**
 * Serialize habits back to the canonical shape. Does not preserve comments
 * or formatting from the original file.
 */
export function serializeHabits(habits) {
  const lines = ["habits:"];
  for (const h of habits) {
    lines.push(`  - id: ${h.id}`);
    lines.push(`    name: ${h.name}`);
    lines.push(`    xp: ${h.xp}`);
  }
  return lines.join("\n") + "\n";
}
```

If the existing parser export names differ (e.g. `parseHabitsYaml`), rename the new functions to match so `main.js` doesn't need edits.

- [ ] **Step 4: Drop `js-yaml` from `plugins/habits/package.json`**

Remove `"js-yaml"` from `dependencies`. Save.

- [ ] **Step 5: Refresh lockfile and run tests**

Run: `pnpm install`

Then: `pnpm typecheck && pnpm --filter @atlas-plugin/habits test`

Expected: all parser tests pass; no lockfile errors.

Run: `pnpm build`

Expected: built-in-plugins chunk drops from ~55 kB to ~10-15 kB. Record the new number for the commit message.

- [ ] **Step 6: Commit**

```bash
git add plugins/habits/ pnpm-lock.yaml
git commit -m "perf(habits): replace js-yaml with hand parser (~40 kB bundle drop)"
```

---

## Task 3: Move `xp.load()` off the critical boot path (#15)

**Files:**
- Modify: `packages/core/src/xp/xp-store.ts` — add snapshot + async tail replay
- Modify: `packages/core/src/xp/xp-store.test.ts` — tests for snapshot + replay
- Modify: `packages/core/src/runtime.ts` — stop awaiting `xp.load()` on boot

**Design:**
- `.atlas/xp-state.json` stores `{ state: XpState, lastSeenTs: number, lastXpDate: string | null }`.
- `XpStore.load()` becomes fast-path:
  1. Read `xp-state.json` if it exists — synchronously populate `state` + `lastSeenTs` + `lastXpDate` and emit `onChange` listeners.
  2. Kick off async tail replay of `xp.log` (only lines with `ts > lastSeenTs`) on a background promise accessible via `store.ready`.
- `XpStore.flush()` also writes the snapshot after the log append.
- On first boot (no snapshot), `load()` falls back to full log replay (current behavior). Same snapshot gets written after first `flush`.

**Acceptance criteria:**
- `runtime.load()` returns in constant time w.r.t. xp.log length once the snapshot exists.
- `store.ready` resolves after tail replay completes (for tests).
- State observed during the gap between snapshot-load and replay-complete may be stale by up to a few events; this is acceptable because the statusline repaints on every `onChange`.

- [ ] **Step 1: Read the current `xp-store.ts`**

Confirm the current public surface: `load()`, `getState()`, `award()`, `onChange()`, `flush()`. Don't change those signatures.

- [ ] **Step 2: Write failing tests**

Add to `xp-store.test.ts`:

```ts
describe("XpStore snapshot + async replay", () => {
  let dir: string;
  let vault: NodeVaultFs;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atlas-xp-snap-"));
    vault = new NodeVaultFs(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes xp-state.json on flush", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    store.award({ amount: 25, reason: "t", source: "test", kind: "xp" });
    await store.flush();
    expect(await vault.exists(".atlas/xp-state.json")).toBe(true);
    const raw = await vault.read(".atlas/xp-state.json");
    const snap = JSON.parse(raw);
    expect(snap.state.xp).toBe(25);
    expect(typeof snap.lastSeenTs).toBe("number");
  });

  it("load() fast-paths from snapshot without reading the full log", async () => {
    // Seed a fat log with many events
    const lines = Array.from({ length: 500 }, (_, i) =>
      JSON.stringify({ ts: 1_000_000 + i, source: "seed", delta: 1, reason: "", kind: "xp" })
    ).join("\n") + "\n";
    await vault.write(".atlas/xp.log", lines);

    // Reduce once and snapshot
    const seed = new XpStore(vault, { base: 500, gameMode: true });
    await seed.load();
    await seed.flush();

    // Append 3 new events after snapshot
    const more = Array.from({ length: 3 }, (_, i) =>
      JSON.stringify({ ts: 2_000_000 + i, source: "new", delta: 10, reason: "", kind: "xp" })
    ).join("\n") + "\n";
    await vault.append(".atlas/xp.log", more);

    // Fresh store — load should be fast (snapshot hit) but await store.ready
    // should reconcile with the 3 new events.
    const fresh = new XpStore(vault, { base: 500, gameMode: true });
    await fresh.load();
    expect(fresh.getState().xp).toBe(500); // snapshot-only state
    await fresh.ready;
    expect(fresh.getState().xp).toBe(530); // after replay
  });
});
```

Note: `await fresh.ready` — add a public `ready: Promise<void>` field to `XpStore` that resolves when tail replay finishes.

- [ ] **Step 3: Run tests — expect failures**

Run: `pnpm --filter @atlas/core test -- xp-store`

Expected: the two new tests fail (snapshot not written yet; `ready` doesn't exist).

- [ ] **Step 4: Implement snapshot + replay**

In `xp-store.ts`:

```ts
const LOG_PATH = ".atlas/xp.log";
const SNAPSHOT_PATH = ".atlas/xp-state.json";

interface Snapshot {
  state: XpState;
  lastSeenTs: number;
  lastXpDate: string | null;
}

export class XpStore {
  // ... existing fields ...
  private lastSeenTs = 0;
  public ready: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    this.state = emptyState();
    this.lastXpDate = null;
    this.lastSeenTs = 0;

    // Fast path: snapshot exists.
    if (await this.vault.exists(SNAPSHOT_PATH)) {
      try {
        const raw = await this.vault.read(SNAPSHOT_PATH);
        const snap = JSON.parse(raw) as Snapshot;
        this.state = snap.state;
        this.lastSeenTs = snap.lastSeenTs;
        this.lastXpDate = snap.lastXpDate;
        for (const l of [...this.listeners]) l(this.state);
        // Kick off async tail replay but do not await.
        this.ready = this.replayTail();
        return;
      } catch {
        // Fall through to full replay on corrupt snapshot.
      }
    }

    // Cold path: full log replay (first boot, or corrupt snapshot).
    await this.replayFromLog(0);
  }

  private async replayTail(): Promise<void> {
    await this.replayFromLog(this.lastSeenTs);
  }

  private async replayFromLog(since: number): Promise<void> {
    if (!(await this.vault.exists(LOG_PATH))) return;
    const raw = await this.vault.read(LOG_PATH);
    let changed = false;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as XpEvent;
        if (event.ts <= since) continue;
        this.apply(event);
        this.lastSeenTs = Math.max(this.lastSeenTs, event.ts);
        changed = true;
      } catch {
        // skip malformed line
      }
    }
    if (changed) for (const l of [...this.listeners]) l(this.state);
  }

  async flush(): Promise<void> {
    await this.writeChain;
    // Snapshot after flush so the on-disk state is always consistent with the log tail.
    const snap: Snapshot = {
      state: this.state,
      lastSeenTs: this.lastSeenTs,
      lastXpDate: this.lastXpDate,
    };
    await this.vault.write(SNAPSHOT_PATH, JSON.stringify(snap));
  }
  // ... `award` updates lastSeenTs when it applies an event ...
}
```

Update `award()` to set `this.lastSeenTs = Math.max(this.lastSeenTs, event.ts)` after it applies the event.

- [ ] **Step 5: Unblock boot in `runtime.ts`**

Find the line `await xp.load()` (around line 37 per the perf review). Change it to:

```ts
void xp.load();
```

Or, if we want to await the snapshot-load but not the tail replay, split the API: `await xp.loadSnapshot(); xp.ready` — but the simpler fix is to just not await at boot.

Keep `await xp.flush()` everywhere it exists — the tests and shutdown path depend on it.

- [ ] **Step 6: Run tests — expect pass**

Run: `pnpm --filter @atlas/core test -- xp-store`

Expected: snapshot tests pass; all pre-existing xp-store tests still pass.

Run full suite: `pnpm typecheck && pnpm test`

Expected: 178+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/xp/ packages/core/src/runtime.ts
git commit -m "perf(xp): snapshot xp-state.json + async tail replay; unblock boot"
```

---

## Task 4: Delete unused `lit` dep + validate plugin ids (#19)

**Files:**
- Modify: `apps/console/package.json`
- Modify: `apps/console/src/boot/built-in-plugins.ts`
- Modify: `packages/core/src/plugins/plugin-loader.ts`

- [ ] **Step 1: Confirm `lit` is unused**

Run: `grep -r "from ['\"]lit" apps/console/src packages`

Expected: zero hits. (If any exist, abort this step and flag.)

- [ ] **Step 2: Delete `lit` from `apps/console/package.json`**

Remove the line from `dependencies`. Save.

- [ ] **Step 3: Add id validation**

In `apps/console/src/boot/built-in-plugins.ts`, in `extractPluginId` (or wherever the id is derived from the file path), replace the return with:

```ts
const PLUGIN_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

function extractPluginId(path: string): string | null {
  const m = path.match(/\/plugins\/([^/]+)\/main\.js$/);
  if (!m) return null;
  const id = m[1];
  if (!PLUGIN_ID_RE.test(id)) {
    // eslint-disable-next-line no-console
    console.warn(`[atlas] refusing to load plugin with invalid id: "${id}"`);
    return null;
  }
  return id;
}
```

In `packages/core/src/plugins/plugin-loader.ts`, add the same regex and validate inside `addStaticPlugin` + the on-disk load path. Reject with a thrown error (core-level) rather than a console warn.

- [ ] **Step 4: Refresh lockfile + verify**

Run: `pnpm install && pnpm typecheck && pnpm test`

Expected: lockfile updates cleanly; types pass; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/console/package.json pnpm-lock.yaml apps/console/src/boot/built-in-plugins.ts packages/core/src/plugins/plugin-loader.ts
git commit -m "chore(deps): remove unused lit + enforce plugin id regex"
```

---

## Task 5: Forker docs — ARCHITECTURE.md + PLUGIN_API.md (#18)

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/PLUGIN_API.md`
- Modify: `README.md` — add one line under "Fork it" pointing at both

- [ ] **Step 1: Create `docs/ARCHITECTURE.md`**

Write it as a 400-word orientation. Structure:

```markdown
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
```

- [ ] **Step 2: Create `docs/PLUGIN_API.md`**

Flatten the six SDK files into one reference page. Each section is a type, followed by a one-line description and a bulleted list of members. Example structure:

```markdown
# Plugin API Reference

The complete surface a plugin author needs. Every type below is exported from `@atlas/sdk`.

## Plugin

```ts
interface Plugin {
  onload(ctx: PluginContext): void | Promise<void>;
  onunload?(ctx: PluginContext): void | Promise<void>;
}
```

Default-export a class implementing this from your plugin's `main.js`. The runtime instantiates it once.

## PluginContext

Passed to `onload`. Exposes seven capability APIs.

| Field | Type | Purpose |
|-------|------|---------|
| `pluginId` | `string` | Your plugin id (directory name). |
| `vault` | `VaultFs` | Scoped FS access (see note below). |
| `commands` | `CommandApi` | Register/invoke slash commands. |
| `events` | `EventApi` | Subscribe to and emit app events. |
| `xp` | `XpApi` | Award XP, read HUD state. |
| `nav` | `NavApi` | Add entries to the screen nav. |
| `ui` | `UiApi` | Register views for screens. |

> **Note on `ctx.vault`:** this is **defence-in-depth, not a sandbox**. See [`CONTRIBUTING.md`](../CONTRIBUTING.md#plugin-trust-model).

## CommandApi

(... similar tables for CommandApi, EventApi, VaultFs, XpApi, NavApi, UiApi, plus EventMap augmentation pattern ...)

## Writing your first plugin

```bash
pnpm new:plugin hello-world
```

Then edit `plugins/hello-world/main.js`. The template is ~40 lines and shows commands, XP, vault writes, and event subscriptions.
```

Fill in every table with real member names and one-line descriptions. Pull the descriptions from the TSDoc that Task 1 of M11 added — this doc is the flattened view of the same content.

- [ ] **Step 3: Add a one-liner to README.md**

Under the "Fork it" section, add after the existing paragraph:

```markdown
For the architecture overview see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). For the full plugin API reference see [`docs/PLUGIN_API.md`](./docs/PLUGIN_API.md).
```

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md docs/PLUGIN_API.md README.md
git commit -m "docs: add ARCHITECTURE.md + PLUGIN_API.md for forkers"
```

---

## Task 6: Final wrap

**Files:**
- Modify: `docs/TECH-DEBT.md`

- [ ] **Step 1: Flip rows #13, #14, #15, #18, #19 to 🟢**

In the Tier 3 table.

- [ ] **Step 2: Final verification**

```bash
pnpm typecheck && pnpm test && (cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo test)
```

Expected: typecheck clean; 178+ JS tests pass (tests added in Tasks 2 and 3 bump this); 4 Rust tests pass.

- [ ] **Step 3: Commit**

```bash
git add docs/TECH-DEBT.md
git commit -m "docs: mark Tier 3 Groups D + F complete"
```

---

## Self-review notes

**Scope coverage:** Tier-3 rows #13, #14, #15, #18, #19 → Tasks 1-5. No gaps.

**No placeholders:** every code block is complete. Every file path is literal. The "replace XX with actual kB drop" in Task 1's commit message is the only human-filled slot — that's acceptable because the number is measurement-dependent.

**Risk assessment:**
- Task 1 (HTML strip) is mechanical but has one land-mine: the nav button `data-scr="ailab"` id must stay — renaming it cascades to `core-commands.ts` and `nav.ts`. The plan flags this explicitly.
- Task 3 (xp snapshot) is the only behavior-changing refactor. The new tests cover the main paths but manual smoke isn't hurt — the subagent should run the full JS suite twice to shake out flakes.
- Task 4's id regex rejects existing plugin dirs that happen to contain uppercase or start with digits. Confirm the three built-ins all match `/^[a-z][a-z0-9_-]{0,31}$/` before shipping (they do: `tasks`, `journal`, `habits`, `template`).

**Ordering:** Tasks 1, 2, 4, 5 are independent and can run in parallel. Task 3 touches `xp-store` + `runtime.ts` which are only referenced by Task 4 tangentially (no conflict). Task 6 is last. A two-implementer pass (Tasks 1+2 parallel, then 3+4 parallel, then 5, then 6) is efficient.
