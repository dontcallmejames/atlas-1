# Atlas 1 — M5 Journal + Habits Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the remaining two v1 plugins. **Journal** gives daily notes as plain Markdown files at `<vault>/journal/YYYY/MM/YYYY-MM-DD.md` with commands to open today's note, quick-capture a timestamped line, and edit via an auto-saving textarea. **Habits** gives a YAML-defined habit list at `<vault>/habits/habits.yaml` with an append-only JSONL log, commands to check in / uncheckin / status, a 30-day heatmap view, and XP rewards per check-in. Together with Tasks (M4), the v1 module trio is complete.

**Architecture:** Two independent plain-JS plugins, each following the same pattern M4's Tasks plugin established: parser module with unit tests, plugin main.js using only `@atlas/sdk` through JSDoc, integration tests that exercise the plugin through the public context API. Both plugins register a nav tab + view via `ctx.nav`/`ctx.ui`, store data via `ctx.vault`, and award XP via `ctx.xp`. Habits adds one external dep — `js-yaml` — for parsing habit definitions; everything else is zero-dep.

**Tech Stack:** Plain JS with JSDoc types. Vitest for tests. `js-yaml ^4.1` for Habits. No changes to `@atlas/core`, `@atlas/sdk`, or the shell.

**Prerequisite reading:**
- Spec: `docs/superpowers/specs/2026-04-19-atlas-1-v1-design.md` — **Vault Layout**, **Theming, Stats & Game Layer** (XP + streaks).
- M4 plan: `docs/superpowers/plans/2026-04-19-m4-tasks.md` — this plan closely mirrors that pattern.
- Reference implementation: `plugins/tasks/main.js`, `plugins/tasks/parser.js`, `plugins/tasks/main.test.js` — both new plugins copy this shape.

**Windows note:** Bash with forward slashes. Cargo on `PATH="/c/Users/jford/.cargo/bin:$PATH"`. `Write` tool may fail EEXIST; fall back to `cat > path << 'ENDOFFILE'` with single-quoted delimiter when content has `$` or backticks.

---

## File structure after M5

```
plugins/journal/
├── package.json
├── manifest.json          # upgraded from M1 stub
├── main.js                # real implementation (JSDoc-typed)
├── parser.js              # date ↔ path utilities
├── parser.test.js
├── main.test.js
├── vitest.config.js
└── README.md

plugins/habits/
├── package.json
├── manifest.json          # upgraded from M1 stub
├── main.js                # real implementation
├── parser.js              # YAML defs + JSONL log parse/serialize + streak
├── parser.test.js
├── main.test.js
├── vitest.config.js
└── README.md
```

Neither plugin modifies `@atlas/core`, `@atlas/sdk`, or `apps/console/`.

---

# Journal plugin

## Task 1: Journal parser (date/path utilities, TDD)

**Files:**
- Create: `plugins/journal/package.json`
- Create: `plugins/journal/vitest.config.js`
- Create: `plugins/journal/parser.js`
- Create: `plugins/journal/parser.test.js`

### Steps

- [ ] **Step 1: Create `plugins/journal/package.json`**

```json
{
  "name": "@atlas-plugin/journal",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@atlas/core": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

The `@atlas/core` workspace dep is for integration tests in Task 2 — not strictly needed by the plugin itself at runtime (plugins only use `@atlas/sdk` via JSDoc).

- [ ] **Step 2: Create `plugins/journal/vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["*.test.js"],
    environment: "node",
    reporters: "default",
  },
  resolve: {
    alias: {
      "@atlas/core/src/vault/node-vault-fs.js": new URL(
        "../../packages/core/src/vault/node-vault-fs.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
```

This mirrors the aliasing used by `plugins/tasks/vitest.config.js` so tests can import `NodeVaultFs` via the deep path.

- [ ] **Step 3: Install**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm install
```
Expected: `@atlas-plugin/journal` registered as workspace package.

- [ ] **Step 4: Write failing tests** at `plugins/journal/parser.test.js`:

```js
import { describe, it, expect } from "vitest";
import { dateToPath, pathToDate, formatDate, todayDate, parseDate } from "./parser.js";

describe("formatDate", () => {
  it("formats a Date into YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-04-20T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("zero-pads single-digit month and day", () => {
    const d = new Date(2026, 0, 5); // jan 5, local time
    expect(formatDate(d)).toBe("2026-01-05");
  });
});

describe("parseDate", () => {
  it("parses YYYY-MM-DD into a Date at local midnight", () => {
    const d = parseDate("2026-04-20");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(20);
  });

  it("returns null for malformed input", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("2026-4-1")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("dateToPath", () => {
  it("writes to YYYY/MM/YYYY-MM-DD.md", () => {
    expect(dateToPath(new Date(2026, 3, 20))).toBe("2026/04/2026-04-20.md");
  });

  it("zero-pads the month folder", () => {
    expect(dateToPath(new Date(2026, 0, 5))).toBe("2026/01/2026-01-05.md");
  });
});

describe("pathToDate", () => {
  it("extracts a date from a canonical daily-note path", () => {
    expect(pathToDate("2026/04/2026-04-20.md")).toBe("2026-04-20");
  });

  it("returns null for non-daily-note paths", () => {
    expect(pathToDate("templates/daily.md")).toBeNull();
    expect(pathToDate("not-a-journal-file.md")).toBeNull();
  });
});

describe("todayDate", () => {
  it("returns today's date in YYYY-MM-DD", () => {
    const t = todayDate();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    expect(t).toBe(formatDate(now));
  });
});
```

- [ ] **Step 5: Run tests — verify they fail**

```bash
pnpm --filter @atlas-plugin/journal test
```
Expected: module not found for `./parser.js`.

- [ ] **Step 6: Write `plugins/journal/parser.js`**

```js
/**
 * Format a Date as YYYY-MM-DD in local time.
 * @param {Date} d
 * @returns {string}
 */
export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a strict YYYY-MM-DD string into a Date at local midnight.
 * Returns null if the input does not match.
 * @param {string} s
 * @returns {Date | null}
 */
export function parseDate(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/**
 * Convert a Date to the vault-relative daily-note path:
 *   YYYY/MM/YYYY-MM-DD.md
 * @param {Date} d
 * @returns {string}
 */
export function dateToPath(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${y}-${m}-${day}.md`;
}

/**
 * Extract YYYY-MM-DD from a canonical daily-note path.
 * Returns null if the path is not a daily note.
 * @param {string} path
 * @returns {string | null}
 */
export function pathToDate(path) {
  const m = path.match(/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\.md$/);
  return m ? m[3] : null;
}

/**
 * Today's date as YYYY-MM-DD.
 * @returns {string}
 */
export function todayDate() {
  return formatDate(new Date());
}
```

- [ ] **Step 7: Run tests — verify pass**

```bash
pnpm --filter @atlas-plugin/journal test
```
Expected: 9 passed (2 formatDate + 2 parseDate + 2 dateToPath + 2 pathToDate + 1 todayDate).

- [ ] **Step 8: Commit**

```bash
git add plugins/journal/package.json plugins/journal/vitest.config.js plugins/journal/parser.js plugins/journal/parser.test.js pnpm-lock.yaml
git commit -m "feat(journal): date/path parser with tests"
```

---

## Task 2: Journal plugin — manifest, main.js, integration tests

**Files:**
- Replace: `plugins/journal/manifest.json`
- Replace: `plugins/journal/main.js`
- Create: `plugins/journal/README.md`
- Create: `plugins/journal/main.test.js`

### Steps

- [ ] **Step 1: Replace `plugins/journal/manifest.json`** with:

```json
{
  "id": "journal",
  "name": "Journal",
  "version": "0.1.0",
  "author": "atlas",
  "atlas": ">=0.1.0",
  "main": "main.js",
  "permissions": ["vault:read", "vault:write", "commands", "nav", "ui"]
}
```

- [ ] **Step 2: Replace `plugins/journal/main.js`** with:

```js
import { todayDate, parseDate, dateToPath, pathToDate, formatDate } from "./parser.js";

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @param {string} date  YYYY-MM-DD
 * @returns {Promise<string>}
 */
async function readNote(ctx, date) {
  const d = parseDate(date);
  if (!d) return "";
  const path = dateToPath(d);
  if (!(await ctx.vault.exists(path))) return "";
  return ctx.vault.read(path);
}

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @param {string} date
 * @param {string} content
 */
async function writeNote(ctx, date, content) {
  const d = parseDate(date);
  if (!d) throw new Error(`invalid date: ${date}`);
  await ctx.vault.write(dateToPath(d), content);
}

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @returns {Promise<string[]>}  array of YYYY-MM-DD in descending order
 */
async function listNoteDates(ctx) {
  const dates = new Set();
  let years;
  try {
    years = await ctx.vault.list(".");
  } catch {
    return [];
  }
  for (const y of years) {
    if (!/^\d{4}$/.test(y)) continue;
    let months;
    try {
      months = await ctx.vault.list(y);
    } catch {
      continue;
    }
    for (const m of months) {
      if (!/^\d{2}$/.test(m)) continue;
      let files;
      try {
        files = await ctx.vault.list(`${y}/${m}`);
      } catch {
        continue;
      }
      for (const f of files) {
        const d = pathToDate(`${y}/${m}/${f}`);
        if (d) dates.add(d);
      }
    }
  }
  return [...dates].sort().reverse();
}

export default class JournalPlugin {
  /** @param {import("@atlas/sdk").PluginContext} ctx */
  async onload(ctx) {
    this.ctx = ctx;
    this.viewDate = todayDate();

    ctx.nav.register({ id: "journal", label: "journal", group: "CORE" });

    ctx.ui.registerView("journal", async () => ({
      render: (el) => this.renderInto(el),
    }));

    ctx.commands.register({
      id: "today",
      hint: "/journal.today",
      run: async () => {
        this.viewDate = todayDate();
        await ctx.commands.invoke("go", ["journal"]);
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "open",
      hint: "/journal.open <YYYY-MM-DD>",
      run: async (args) => {
        const date = args[0];
        if (!date || !parseDate(date)) return;
        this.viewDate = date;
        await ctx.commands.invoke("go", ["journal"]);
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "append",
      hint: "/journal.append <text>",
      run: async (args) => {
        const text = args.join(" ").trim();
        if (!text) return;
        const date = todayDate();
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const line = `- **${hh}:${mm}** ${text}\n`;
        const current = await readNote(ctx, date);
        const header = current ? "" : `# ${date}\n\n`;
        await writeNote(ctx, date, (current || header) + line);
        if (this.viewDate === date) this.refresh();
      },
    });

    ctx.commands.register({
      id: "list",
      hint: "/journal.list",
      run: async () => {
        const dates = await listNoteDates(ctx);
        // eslint-disable-next-line no-console
        console.log(`journal entries (${dates.length}):\n${dates.map((d) => "  " + d).join("\n")}`);
      },
    });
  }

  /** Re-render the view if it's currently mounted. */
  refresh() {
    if (this._container) this.renderInto(this._container);
  }

  /** @param {HTMLElement} el */
  async renderInto(el) {
    this._container = el;
    const date = this.viewDate;
    const content = await readNote(this.ctx, date);
    const dates = await listNoteDates(this.ctx);

    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.padding = "20px";
    wrap.style.fontFamily = "JetBrains Mono, monospace";
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr 180px";
    wrap.style.gap = "20px";

    // --- main column: editor
    const main = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = `~/journal/${date}.md`;
    title.style.opacity = "0.6";
    title.style.fontSize = "11px";
    title.style.marginBottom = "12px";
    main.appendChild(title);

    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.placeholder = `# ${date}\n\nthinking...`;
    textarea.style.width = "100%";
    textarea.style.minHeight = "60vh";
    textarea.style.background = "transparent";
    textarea.style.color = "inherit";
    textarea.style.fontFamily = "inherit";
    textarea.style.fontSize = "13px";
    textarea.style.border = "1px dashed var(--line)";
    textarea.style.padding = "12px";
    textarea.style.outline = "none";
    textarea.style.resize = "vertical";
    const save = async () => {
      await writeNote(this.ctx, date, textarea.value);
    };
    let saveTimer;
    textarea.addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { void save(); }, 500);
    });
    textarea.addEventListener("blur", () => {
      clearTimeout(saveTimer);
      void save();
    });
    main.appendChild(textarea);

    const hint = document.createElement("div");
    hint.style.marginTop = "8px";
    hint.style.opacity = "0.5";
    hint.style.fontSize = "11px";
    hint.innerHTML =
      "autosaves 500 ms after last keystroke and on blur &middot; " +
      "<code>/journal.append &lt;text&gt;</code> for quick capture";
    main.appendChild(hint);

    // --- side column: recent dates
    const side = document.createElement("div");
    const sideTitle = document.createElement("div");
    sideTitle.textContent = "recent";
    sideTitle.style.opacity = "0.6";
    sideTitle.style.fontSize = "10px";
    sideTitle.style.letterSpacing = "0.08em";
    sideTitle.style.textTransform = "uppercase";
    sideTitle.style.marginBottom = "8px";
    side.appendChild(sideTitle);

    const list = document.createElement("ul");
    list.style.listStyle = "none";
    list.style.padding = "0";
    list.style.margin = "0";
    list.style.fontSize = "12px";
    const shown = dates.slice(0, 14);
    if (shown.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.4";
      empty.style.fontSize = "11px";
      empty.textContent = "(no entries yet)";
      side.appendChild(empty);
    } else {
      for (const d of shown) {
        const li = document.createElement("li");
        li.style.padding = "4px 6px";
        li.style.cursor = "pointer";
        li.style.borderRadius = "3px";
        if (d === date) {
          li.style.background = "var(--ink)";
          li.style.color = "var(--paper)";
        }
        li.textContent = d;
        li.addEventListener("click", () => {
          this.viewDate = d;
          this.refresh();
        });
        list.appendChild(li);
      }
      side.appendChild(list);
    }

    wrap.appendChild(main);
    wrap.appendChild(side);
    el.appendChild(wrap);
  }
}
```

Design decisions:
- `viewDate` is a plugin-instance field. `journal.today` and `journal.open` change it and re-render.
- Autosave debounced 500 ms + explicit save on blur. No XP on journal edits — the spec reserves XP for discrete completions, not freeform writing.
- Right-column list shows the last 14 dates (keeps the panel compact). Click a date to switch.
- `journal.append` seeds a `# YYYY-MM-DD` header if the note is new.

- [ ] **Step 3: Create `plugins/journal/README.md`**

```markdown
# Journal

Built-in plugin for Atlas 1 — daily notes as plain Markdown files.

## Data

    <vault>/journal/
    ├── 2026/
    │   └── 04/
    │       ├── 2026-04-19.md
    │       └── 2026-04-20.md
    └── 2026/05/...

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
- [parser.js](./parser.js) — pure date ↔ path utilities.
- Uses only `@atlas/sdk` via JSDoc. No `@atlas/core` runtime dep.
```

- [ ] **Step 4: Write `plugins/journal/main.test.js`**:

```js
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "@atlas/core/src/vault/node-vault-fs.js";
import { CommandRegistry, EventBus, XpStore, MountRegistry, createContext } from "@atlas/core";
import JournalPlugin from "./main.js";
import { todayDate, dateToPath, parseDate } from "./parser.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-journal-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  const xp = new XpStore(vault, { base: 500, gameMode: true });
  await xp.load();
  const mounts = new MountRegistry();
  const ctx = createContext({
    pluginId: "journal",
    core: { vault, commands, events, xp, mounts },
  });
  return { dir, vault, commands, xp, mounts, ctx };
}

describe("JournalPlugin", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("onload registers nav, view, and four commands", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);
    expect(env.mounts.listNavs().map((n) => n.id)).toEqual(["journal"]);
    expect(env.mounts.listViews().map((v) => v.screenId)).toEqual(["journal"]);
    const ids = env.commands.list().map((c) => c.id).sort();
    expect(ids).toEqual([
      "journal.append",
      "journal.list",
      "journal.open",
      "journal.today",
    ]);
  });

  it("journal.append writes a timestamped line to today's note", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("journal.append", ["hello", "world"]);

    const today = todayDate();
    const d = parseDate(today);
    const path = `journal/${dateToPath(d)}`;
    const raw = await env.vault.read(path);
    expect(raw).toMatch(new RegExp(`^# ${today}\n\n- \\*\\*\\d{2}:\\d{2}\\*\\* hello world\n$`));
  });

  it("journal.append appends to an existing note without re-seeding the header", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("journal.append", ["first"]);
    await env.commands.invoke("journal.append", ["second"]);

    const today = todayDate();
    const d = parseDate(today);
    const path = `journal/${dateToPath(d)}`;
    const raw = await env.vault.read(path);
    const headerCount = (raw.match(new RegExp(`^# ${today}$`, "gm")) || []).length;
    expect(headerCount).toBe(1);
    expect(raw).toMatch(/first/);
    expect(raw).toMatch(/second/);
  });

  it("journal.open rejects a malformed date silently", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);

    // Should not throw
    await env.commands.invoke("journal.open", ["not-a-date"]);
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests — verify pass**

```bash
pnpm --filter @atlas-plugin/journal test
```
Expected: 9 parser + 4 integration = 13 passed.

- [ ] **Step 6: Commit**

```bash
git add plugins/journal/manifest.json plugins/journal/main.js plugins/journal/README.md plugins/journal/main.test.js
git commit -m "feat(journal): daily-note plugin with autosave editor and quick append"
```

---

# Habits plugin

## Task 3: Habits parser + streak logic (TDD)

**Files:**
- Create: `plugins/habits/package.json`
- Create: `plugins/habits/vitest.config.js`
- Create: `plugins/habits/parser.js`
- Create: `plugins/habits/parser.test.js`

### Steps

- [ ] **Step 1: Create `plugins/habits/package.json`**

```json
{
  "name": "@atlas-plugin/habits",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@atlas/core": "workspace:*",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `plugins/habits/vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["*.test.js"],
    environment: "node",
    reporters: "default",
  },
  resolve: {
    alias: {
      "@atlas/core/src/vault/node-vault-fs.js": new URL(
        "../../packages/core/src/vault/node-vault-fs.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
```

- [ ] **Step 3: Install**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm install
```
Expected: `js-yaml` resolved.

- [ ] **Step 4: Write failing tests** at `plugins/habits/parser.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  parseHabits,
  serializeHabits,
  parseLog,
  serializeLogEntry,
  streakFor,
  todayDate,
  defaultHabits,
} from "./parser.js";

describe("parseHabits", () => {
  it("parses a YAML habits file", () => {
    const yaml = [
      "habits:",
      "  - id: workout",
      "    name: Workout",
      "    xp: 30",
      "  - id: read",
      "    name: Read 20 min",
      "    xp: 10",
    ].join("\n");
    expect(parseHabits(yaml)).toEqual([
      { id: "workout", name: "Workout", xp: 30 },
      { id: "read", name: "Read 20 min", xp: 10 },
    ]);
  });

  it("returns [] for an empty or missing file", () => {
    expect(parseHabits("")).toEqual([]);
    expect(parseHabits("habits: []")).toEqual([]);
  });

  it("drops entries missing id or name", () => {
    const yaml = [
      "habits:",
      "  - id: ok",
      "    name: Good",
      "    xp: 5",
      "  - name: no id",
      "  - id: no-name",
    ].join("\n");
    expect(parseHabits(yaml).map((h) => h.id)).toEqual(["ok"]);
  });

  it("defaults xp to 10 when missing", () => {
    const yaml = ["habits:", "  - id: a", "    name: A"].join("\n");
    expect(parseHabits(yaml)[0].xp).toBe(10);
  });
});

describe("serializeHabits", () => {
  it("round-trips parse/serialize", () => {
    const habits = [
      { id: "a", name: "A", xp: 10 },
      { id: "b", name: "B", xp: 20 },
    ];
    const yaml = serializeHabits(habits);
    expect(parseHabits(yaml)).toEqual(habits);
  });
});

describe("parseLog", () => {
  it("parses JSONL entries, one per line", () => {
    const src = [
      '{"ts":1,"habitId":"workout","date":"2026-04-18"}',
      '{"ts":2,"habitId":"workout","date":"2026-04-19"}',
    ].join("\n");
    expect(parseLog(src)).toEqual([
      { ts: 1, habitId: "workout", date: "2026-04-18" },
      { ts: 2, habitId: "workout", date: "2026-04-19" },
    ]);
  });

  it("ignores blank lines and malformed JSON", () => {
    const src = [
      '{"ts":1,"habitId":"a","date":"2026-04-19"}',
      "",
      "not json",
      '{"ts":2,"habitId":"a","date":"2026-04-20"}',
    ].join("\n");
    expect(parseLog(src).map((e) => e.date)).toEqual(["2026-04-19", "2026-04-20"]);
  });
});

describe("serializeLogEntry", () => {
  it("returns a single JSON line with trailing newline", () => {
    const line = serializeLogEntry({ ts: 1, habitId: "a", date: "2026-04-19" });
    expect(line).toBe('{"ts":1,"habitId":"a","date":"2026-04-19"}\n');
  });
});

describe("streakFor", () => {
  it("is 0 when there are no entries", () => {
    expect(streakFor([], "a", "2026-04-20")).toBe(0);
  });

  it("is 1 when only today is checked in", () => {
    const log = [{ ts: 0, habitId: "a", date: "2026-04-20" }];
    expect(streakFor(log, "a", "2026-04-20")).toBe(1);
  });

  it("counts consecutive days back from today", () => {
    const log = [
      { ts: 0, habitId: "a", date: "2026-04-17" },
      { ts: 0, habitId: "a", date: "2026-04-18" },
      { ts: 0, habitId: "a", date: "2026-04-19" },
      { ts: 0, habitId: "a", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(4);
  });

  it("stops at the first gap", () => {
    const log = [
      { ts: 0, habitId: "a", date: "2026-04-17" },
      { ts: 0, habitId: "a", date: "2026-04-19" },
      { ts: 0, habitId: "a", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(2); // 19, 20 — gap before 17
  });

  it("is 0 when today is not checked in and yesterday is", () => {
    const log = [{ ts: 0, habitId: "a", date: "2026-04-19" }];
    expect(streakFor(log, "a", "2026-04-20")).toBe(0);
  });

  it("ignores entries for other habits", () => {
    const log = [
      { ts: 0, habitId: "b", date: "2026-04-19" },
      { ts: 0, habitId: "b", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(0);
  });

  it("deduplicates multiple entries on the same day", () => {
    const log = [
      { ts: 0, habitId: "a", date: "2026-04-19" },
      { ts: 1, habitId: "a", date: "2026-04-19" },
      { ts: 2, habitId: "a", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(2);
  });
});

describe("todayDate", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("defaultHabits", () => {
  it("returns a non-empty habit list for first-run vaults", () => {
    expect(defaultHabits().length).toBeGreaterThan(0);
    for (const h of defaultHabits()) {
      expect(h.id).toMatch(/^[a-z0-9-]+$/);
      expect(h.name.length).toBeGreaterThan(0);
      expect(typeof h.xp).toBe("number");
    }
  });
});
```

- [ ] **Step 5: Run tests — verify they fail**

```bash
pnpm --filter @atlas-plugin/habits test
```
Expected: module not found for `./parser.js`.

- [ ] **Step 6: Write `plugins/habits/parser.js`**

```js
import yaml from "js-yaml";

/**
 * @typedef {Object} Habit
 * @property {string} id
 * @property {string} name
 * @property {number} xp
 */

/**
 * @typedef {Object} LogEntry
 * @property {number} ts       ms since epoch
 * @property {string} habitId
 * @property {string} date     YYYY-MM-DD (local)
 */

/**
 * Parse habits.yaml.
 * @param {string} source
 * @returns {Habit[]}
 */
export function parseHabits(source) {
  if (!source || !source.trim()) return [];
  let parsed;
  try {
    parsed = yaml.load(source);
  } catch {
    return [];
  }
  const list = (parsed && parsed.habits) || [];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const h of list) {
    if (!h || typeof h !== "object") continue;
    if (typeof h.id !== "string" || typeof h.name !== "string") continue;
    out.push({
      id: h.id,
      name: h.name,
      xp: typeof h.xp === "number" ? h.xp : 10,
    });
  }
  return out;
}

/**
 * Serialize habits back to YAML.
 * @param {Habit[]} habits
 * @returns {string}
 */
export function serializeHabits(habits) {
  return yaml.dump({ habits });
}

/**
 * Parse a JSONL log string.
 * @param {string} source
 * @returns {LogEntry[]}
 */
export function parseLog(source) {
  if (!source) return [];
  const out = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const e = JSON.parse(trimmed);
      if (
        typeof e.ts === "number" &&
        typeof e.habitId === "string" &&
        typeof e.date === "string"
      ) {
        out.push({ ts: e.ts, habitId: e.habitId, date: e.date });
      }
    } catch {
      // skip
    }
  }
  return out;
}

/**
 * Serialize a single log entry as a JSONL line (including trailing newline).
 * @param {LogEntry} entry
 * @returns {string}
 */
export function serializeLogEntry(entry) {
  return JSON.stringify({ ts: entry.ts, habitId: entry.habitId, date: entry.date }) + "\n";
}

/**
 * Compute the current consecutive-day streak for a habit ending at `today`.
 * Returns 0 if `today` is not checked in.
 * @param {LogEntry[]} log
 * @param {string} habitId
 * @param {string} today  YYYY-MM-DD
 * @returns {number}
 */
export function streakFor(log, habitId, today) {
  const dates = new Set(log.filter((e) => e.habitId === habitId).map((e) => e.date));
  if (!dates.has(today)) return 0;
  let streak = 0;
  let cursor = today;
  while (dates.has(cursor)) {
    streak++;
    cursor = prevDate(cursor);
    if (!cursor) break;
  }
  return streak;
}

function prevDate(ymd) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * Today's date as YYYY-MM-DD (local).
 * @returns {string}
 */
export function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Default habit list seeded on first run.
 * @returns {Habit[]}
 */
export function defaultHabits() {
  return [
    { id: "workout", name: "Workout", xp: 30 },
    { id: "read", name: "Read 20 min", xp: 10 },
    { id: "meditate", name: "Meditate", xp: 15 },
    { id: "walk", name: "Evening walk", xp: 10 },
  ];
}
```

- [ ] **Step 7: Run tests — verify pass**

```bash
pnpm --filter @atlas-plugin/habits test
```
Expected: 16 passed (4 parseHabits + 1 serializeHabits + 2 parseLog + 1 serializeLogEntry + 7 streakFor + 1 todayDate + 1 defaultHabits).

- [ ] **Step 8: Commit**

```bash
git add plugins/habits/package.json plugins/habits/vitest.config.js plugins/habits/parser.js plugins/habits/parser.test.js pnpm-lock.yaml
git commit -m "feat(habits): YAML parser + JSONL log + streak logic"
```

---

## Task 4: Habits plugin — manifest, main.js, integration tests

**Files:**
- Replace: `plugins/habits/manifest.json`
- Replace: `plugins/habits/main.js`
- Create: `plugins/habits/README.md`
- Create: `plugins/habits/main.test.js`

### Steps

- [ ] **Step 1: Replace `plugins/habits/manifest.json`** with:

```json
{
  "id": "habits",
  "name": "Habits",
  "version": "0.1.0",
  "author": "atlas",
  "atlas": ">=0.1.0",
  "main": "main.js",
  "permissions": ["vault:read", "vault:write", "commands", "nav", "ui"]
}
```

- [ ] **Step 2: Replace `plugins/habits/main.js`** with:

```js
import {
  parseHabits,
  serializeHabits,
  parseLog,
  serializeLogEntry,
  streakFor,
  todayDate,
  defaultHabits,
} from "./parser.js";

const HABITS_PATH = "habits.yaml";

/** @param {import("@atlas/sdk").PluginContext} ctx */
async function loadHabits(ctx) {
  if (!(await ctx.vault.exists(HABITS_PATH))) {
    const seeded = serializeHabits(defaultHabits());
    await ctx.vault.write(HABITS_PATH, seeded);
    return defaultHabits();
  }
  return parseHabits(await ctx.vault.read(HABITS_PATH));
}

function logPathForDate(date) {
  // date is YYYY-MM-DD → log at log/YYYY-MM.jsonl
  return `log/${date.slice(0, 7)}.jsonl`;
}

/** @param {import("@atlas/sdk").PluginContext} ctx */
async function loadLog(ctx) {
  let files;
  try {
    files = await ctx.vault.list("log");
  } catch {
    return [];
  }
  const entries = [];
  for (const f of files) {
    if (!f.endsWith(".jsonl")) continue;
    const raw = await ctx.vault.read(`log/${f}`);
    entries.push(...parseLog(raw));
  }
  return entries;
}

/** @param {import("@atlas/sdk").PluginContext} ctx */
async function appendLog(ctx, entry) {
  await ctx.vault.append(logPathForDate(entry.date), serializeLogEntry(entry));
}

/** Rewrite the log file for a given month, excluding any entries that match a predicate. */
async function removeFromLog(ctx, date, predicate) {
  const path = logPathForDate(date);
  if (!(await ctx.vault.exists(path))) return;
  const raw = await ctx.vault.read(path);
  const kept = parseLog(raw).filter((e) => !predicate(e));
  const next = kept.map(serializeLogEntry).join("");
  await ctx.vault.write(path, next);
}

function last30Dates(today) {
  const dates = [];
  const m = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dates;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${mo}-${day}`);
  }
  return dates;
}

export default class HabitsPlugin {
  /** @param {import("@atlas/sdk").PluginContext} ctx */
  async onload(ctx) {
    this.ctx = ctx;

    ctx.nav.register({ id: "habits", label: "habits", group: "CORE" });

    ctx.ui.registerView("habits", async () => ({
      render: (el) => this.renderInto(el),
    }));

    ctx.commands.register({
      id: "checkin",
      hint: "/habits.checkin <id>",
      run: async (args) => {
        const id = args[0];
        if (!id) return;
        const habits = await loadHabits(ctx);
        const habit = habits.find((h) => h.id === id);
        if (!habit) return;
        const today = todayDate();
        const log = await loadLog(ctx);
        const already = log.some((e) => e.habitId === id && e.date === today);
        if (already) return;
        await appendLog(ctx, { ts: Date.now(), habitId: id, date: today });
        ctx.xp.award({ amount: habit.xp, reason: `habit.${id}` });
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "uncheckin",
      hint: "/habits.uncheckin <id>",
      run: async (args) => {
        const id = args[0];
        if (!id) return;
        const today = todayDate();
        await removeFromLog(ctx, today, (e) => e.habitId === id && e.date === today);
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "list",
      hint: "/habits.list",
      run: async () => {
        const habits = await loadHabits(ctx);
        const log = await loadLog(ctx);
        const today = todayDate();
        // eslint-disable-next-line no-console
        console.log(
          habits
            .map((h) => {
              const done = log.some((e) => e.habitId === h.id && e.date === today);
              const s = streakFor(log, h.id, today);
              return `  ${done ? "[x]" : "[ ]"} ${h.name}  (${h.id}, +${h.xp}xp, streak ${s}d)`;
            })
            .join("\n"),
        );
      },
    });

    ctx.commands.register({
      id: "status",
      hint: "/habits.status",
      run: async () => {
        const habits = await loadHabits(ctx);
        const log = await loadLog(ctx);
        const today = todayDate();
        const rows = habits.map((h) => ({
          id: h.id,
          name: h.name,
          streak: streakFor(log, h.id, today),
          today: log.some((e) => e.habitId === h.id && e.date === today),
        }));
        // eslint-disable-next-line no-console
        console.table(rows);
      },
    });
  }

  refresh() {
    if (this._container) this.renderInto(this._container);
  }

  /** @param {HTMLElement} el */
  async renderInto(el) {
    this._container = el;
    const habits = await loadHabits(this.ctx);
    const log = await loadLog(this.ctx);
    const today = todayDate();

    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.padding = "20px";
    wrap.style.fontFamily = "JetBrains Mono, monospace";

    const title = document.createElement("div");
    title.textContent = "~/habits/habits.yaml";
    title.style.opacity = "0.6";
    title.style.fontSize = "11px";
    title.style.marginBottom = "16px";
    wrap.appendChild(title);

    if (habits.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.5";
      empty.textContent = "no habits configured yet.";
      wrap.appendChild(empty);
      el.appendChild(wrap);
      return;
    }

    const dates = last30Dates(today);

    for (const h of habits) {
      const card = document.createElement("div");
      card.style.marginBottom = "20px";
      card.style.paddingBottom = "16px";
      card.style.borderBottom = "1px dashed var(--line)";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "12px";
      header.style.marginBottom = "10px";

      const doneToday = log.some((e) => e.habitId === h.id && e.date === today);
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = doneToday;
      box.addEventListener("change", async () => {
        if (box.checked) {
          await this.ctx.commands.invoke("habits.checkin", [h.id]);
        } else {
          await this.ctx.commands.invoke("habits.uncheckin", [h.id]);
        }
      });
      header.appendChild(box);

      const name = document.createElement("div");
      name.textContent = h.name;
      name.style.fontSize = "13px";
      name.style.fontWeight = "600";
      header.appendChild(name);

      const meta = document.createElement("div");
      meta.style.marginLeft = "auto";
      meta.style.fontSize = "11px";
      meta.style.opacity = "0.6";
      const streak = streakFor(log, h.id, today);
      meta.textContent = `+${h.xp} xp · streak ${streak}d`;
      header.appendChild(meta);

      card.appendChild(header);

      const heatmap = document.createElement("div");
      heatmap.style.display = "grid";
      heatmap.style.gridTemplateColumns = "repeat(30, 1fr)";
      heatmap.style.gap = "2px";
      heatmap.style.maxWidth = "600px";

      const byDate = new Set(log.filter((e) => e.habitId === h.id).map((e) => e.date));
      for (const d of dates) {
        const cell = document.createElement("div");
        cell.style.aspectRatio = "1";
        cell.style.borderRadius = "2px";
        cell.title = d;
        cell.style.background = byDate.has(d) ? "var(--accent)" : "var(--line)";
        cell.style.opacity = byDate.has(d) ? "1" : "0.2";
        heatmap.appendChild(cell);
      }
      card.appendChild(heatmap);

      wrap.appendChild(card);
    }

    const hint = document.createElement("div");
    hint.style.opacity = "0.5";
    hint.style.fontSize = "11px";
    hint.style.marginTop = "12px";
    hint.innerHTML =
      "commands: <code>/habits.checkin &lt;id&gt;</code> &middot; " +
      "<code>/habits.status</code> &middot; edit <code>~/habits/habits.yaml</code> to add more.";
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }
}
```

Design decisions:
- First run seeds `habits.yaml` with `defaultHabits()` so the view isn't empty.
- Log is partitioned by month (`log/YYYY-MM.jsonl`) to keep files small.
- Check-ins are idempotent: `checkin` refuses if today is already logged.
- Uncheckin rewrites today's month log file, removing matching entries. Not ideal for perf on busy logs, but negligible at single-user scale.
- XP per habit is defined in the YAML (`xp: 30`), not hardcoded.
- Heatmap shows 30 days ending today; colored cell = checked in that day.

- [ ] **Step 3: Create `plugins/habits/README.md`**

```markdown
# Habits

Built-in plugin for Atlas 1 — daily habit tracking with YAML-defined habits
and an append-only JSONL log.

## Data

    <vault>/habits/
    ├── habits.yaml          # habit definitions (human-edited)
    └── log/
        ├── 2026-04.jsonl    # append-only check-in log
        └── 2026-05.jsonl

### habits.yaml

    habits:
      - id: workout
        name: Workout
        xp: 30
      - id: read
        name: Read 20 min
        xp: 10

First run seeds a starter list if the file is missing.

### log/YYYY-MM.jsonl

One JSON line per check-in:

    {"ts":1745123456789,"habitId":"workout","date":"2026-04-20"}

## Commands

| Command                      | Description                                           |
|------------------------------|-------------------------------------------------------|
| `/habits.checkin <id>`       | Mark today done; award the habit's XP; once per day   |
| `/habits.uncheckin <id>`     | Undo today's check-in                                 |
| `/habits.list`               | Log each habit with today's status + streak           |
| `/habits.status`             | Log a table of streaks (devtools)                     |

## UI

One card per habit: checkbox for today, current streak, XP reward, and a
30-day heatmap.

## Fork pointers

- [main.js](./main.js) — lifecycle + commands + view.
- [parser.js](./parser.js) — YAML/JSONL parse/serialize + streak math.
- `js-yaml` is the only runtime dep beyond `@atlas/sdk`.
```

- [ ] **Step 4: Write `plugins/habits/main.test.js`**

```js
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "@atlas/core/src/vault/node-vault-fs.js";
import { CommandRegistry, EventBus, XpStore, MountRegistry, createContext } from "@atlas/core";
import HabitsPlugin from "./main.js";
import { todayDate, parseHabits } from "./parser.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-habits-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  const xp = new XpStore(vault, { base: 500, gameMode: true });
  await xp.load();
  const mounts = new MountRegistry();
  const ctx = createContext({
    pluginId: "habits",
    core: { vault, commands, events, xp, mounts },
  });
  return { dir, vault, commands, xp, mounts, ctx };
}

describe("HabitsPlugin", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("onload registers nav, view, four commands, and seeds habits.yaml on first run", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    expect(env.mounts.listNavs().map((n) => n.id)).toEqual(["habits"]);
    expect(env.mounts.listViews().map((v) => v.screenId)).toEqual(["habits"]);
    const ids = env.commands.list().map((c) => c.id).sort();
    expect(ids).toEqual([
      "habits.checkin",
      "habits.list",
      "habits.status",
      "habits.uncheckin",
    ]);

    // habits.yaml is seeded lazily on first load (loadHabits), not on onload.
    // Trigger it via /habits.list.
    await env.commands.invoke("habits.list");
    const raw = await env.vault.read("habits/habits.yaml");
    expect(parseHabits(raw).length).toBeGreaterThan(0);
  });

  it("checkin appends a log entry, awards the habit's xp, and is idempotent per-day", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("habits.checkin", ["workout"]);
    await env.xp.flush();
    const today = todayDate();
    const logRaw = await env.vault.read(`habits/log/${today.slice(0, 7)}.jsonl`);
    expect(logRaw.split("\n").filter((l) => l.trim()).length).toBe(1);
    expect(env.xp.getState().xp).toBe(30);

    // Second checkin same day is a no-op.
    await env.commands.invoke("habits.checkin", ["workout"]);
    await env.xp.flush();
    const logRaw2 = await env.vault.read(`habits/log/${today.slice(0, 7)}.jsonl`);
    expect(logRaw2.split("\n").filter((l) => l.trim()).length).toBe(1);
    expect(env.xp.getState().xp).toBe(30);
  });

  it("uncheckin removes today's entry for a habit", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("habits.checkin", ["workout"]);
    await env.commands.invoke("habits.uncheckin", ["workout"]);
    const today = todayDate();
    const logRaw = await env.vault.read(`habits/log/${today.slice(0, 7)}.jsonl`);
    expect(logRaw.trim()).toBe("");
  });

  it("checkin for an unknown habit is a no-op", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("habits.checkin", ["nope"]);
    await env.xp.flush();
    expect(env.xp.getState().xp).toBe(0);
    const today = todayDate();
    const path = `habits/log/${today.slice(0, 7)}.jsonl`;
    expect(await env.vault.exists(path)).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests — verify pass**

```bash
pnpm --filter @atlas-plugin/habits test
```
Expected: 16 parser + 4 integration = 20 passed.

- [ ] **Step 6: Commit**

```bash
git add plugins/habits/manifest.json plugins/habits/main.js plugins/habits/README.md plugins/habits/main.test.js
git commit -m "feat(habits): YAML-defined habits, JSONL log, 30-day heatmap view"
```

---

## Task 5: Full test + build sweep

**Files:** none — verification only.

### Steps

- [ ] **Step 1: Typecheck all packages**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 2: Run all unit tests**

```bash
pnpm test
```
Expected:
- `@atlas/core`: 58 passed
- `@atlas/console`: 9 passed
- `@atlas-plugin/tasks`: 18 passed
- `@atlas-plugin/journal`: 13 passed
- `@atlas-plugin/habits`: 20 passed
- Total: **118 passed**

If `@atlas/core` shows a flaky 57/58 due to the known Windows tmpdir cleanup race, re-run once — it usually passes on retry.

- [ ] **Step 3: Build the webview**

```bash
pnpm --filter @atlas/console build
```
Expected: build succeeds. The `built-in-plugins` chunk should now include all three plugins' main.js (visible in the dist output or not, either way is fine — Vite may roll them into the chunk or emit separate chunks).

- [ ] **Step 4: Run Playwright smoke**

```bash
pnpm test:e2e
```
Expected: 1 passed.

- [ ] **Step 5: Cargo check**

```bash
export PATH="/c/Users/jford/.cargo/bin:$PATH" && cd src-tauri && cargo check && cd ..
```
Expected: finished.

- [ ] **Step 6: No commit.**

---

## Task 6: Manual Tauri verification + milestone tag

**Files:** none.

### Steps

- [ ] **Step 1: Start the app**

```bash
export PATH="/c/Users/jford/.cargo/bin:$PATH" && pnpm tauri:dev
```

- [ ] **Step 2: Verify both plugins**

When the window opens (onboarded state — goes straight to home):

**Journal:**
1. Nav tabs now include `journal` (and `tasks` from M4). Click it.
2. Two-column view renders. Textarea is empty.
3. Type a few sentences. Click away (blur) → content saves. Check `<vault>/journal/2026/04/2026-04-<today>.md` — should contain what you typed.
4. Press `/`, type `journal.append just captured something`, Enter. Right-side list still shows today; textarea reloads with a timestamped line at the bottom.
5. Right-side panel should show today's date highlighted.

**Habits:**
1. Click the new `habits` tab.
2. See 4 seeded habits (workout/read/meditate/walk) each with a checkbox + 30-day heatmap (all empty cells).
3. Check a habit → heatmap gets one filled cell (today), XP bar in statusline bumps up.
4. Check `<vault>/habits/habits.yaml` on disk — should have the 4 default habits.
5. Check `<vault>/habits/log/2026-04.jsonl` — should have one line per check-in.
6. `/habits.status` in REPL → devtools prints a table.
7. Uncheck a checked habit → heatmap cell disappears, log file loses the matching line.

**Restart** — close the window, relaunch. Journal content persists, habit check-ins persist, heatmaps show yesterday + today filled (if you restart on a different day).

- [ ] **Step 3: Tag the milestone**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && git tag -a m5-journal-habits -m "M5: Journal + Habits plugins — v1 module trio complete"
```

- [ ] **Step 4: Confirm final state**

```bash
git status
git log --oneline | head -8
git tag | grep m
```
Expected: clean tree, tag `m5-journal-habits` present, history shows M5 commits.

---

## Definition of done

M5 is complete when:

1. `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `cargo check` all pass.
2. **118 tests** across 5 workspace packages all green.
3. Journal plugin: nav tab, view with textarea + recent list, `journal.today` / `journal.open` / `journal.append` / `journal.list` commands, autosave on blur.
4. Habits plugin: nav tab, card view with checkbox + heatmap, `habits.checkin` / `habits.uncheckin` / `habits.list` / `habits.status` commands, XP awards per check-in, first-run seeds habits.yaml with 4 defaults.
5. `<vault>/journal/YYYY/MM/*.md` and `<vault>/habits/{habits.yaml,log/*.jsonl}` are the canonical data files — readable and editable outside Atlas.
6. Git clean, tagged `m5-journal-habits`.

Out of scope (v2+):
- Journal templates (`journal/templates/daily.md` applied on new-note creation).
- Journal backlinks, search, tags.
- Habits weekly/custom cadence (`cadence: weekly` in YAML). v1 is daily-only.
- Habits goal counts (e.g. 3x/week). v1 just binary daily check-in.
- Graph/correlation between habits and XP/vitals.
- Rich-text editing (Journal is plain textarea).

## Risks and mitigations

- **`js-yaml` bundle size.** Small (~30KB minified). Acceptable.
- **Log rewrite on uncheckin.** O(entries-in-month-file). Months with hundreds of check-ins still round-trip in <10ms on typical hardware. Not a concern at single-user scale.
- **Date/timezone edge cases.** All dates are local-time; `todayDate()` and `parseDate()` use the user's local timezone. A traveler changing timezones mid-day sees "today" shift — acceptable for v1.
- **Missing habits.yaml at runtime.** First `loadHabits` call seeds defaults. If the user deletes the file afterward, next `loadHabits` re-seeds. That's a feature, not a bug — makes the plugin resilient.
