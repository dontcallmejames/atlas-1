# Atlas 1 — M6 Rituals + Global Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two M6 differentiators from the spec. **Rituals** are plain-text command-sequence files at `<vault>/.atlas/rituals/*.atlas` — each line is a command the user could also type at the REPL. Rituals run via `/ritual.run <name>`, from a `@cron` directive in the file (in-app minute-level scheduler), or from an `@on <event>` directive. **Global Shortcut** registers a system-wide hotkey (default `CommandOrControl+Shift+Space`) that focuses — or launches and focuses — the Atlas window with the command bar ready for input.

**Architecture:** Rituals live in `@atlas/core`, not as a plugin — they compose commands registered by everything else, so they need to see the full registry. Four new core modules: a minimal cron matcher, a parser that turns `.atlas` text into structured directives + lines, a runner that invokes each line via the command registry with `$arg` substitution, and a registry that loads all ritual files at boot, seeds defaults on first run, schedules cron triggers on a 1-minute tick, subscribes event triggers to the event bus, and exposes `runRitual(name, args)`. The registry's commands (`ritual.run`, `ritual.list`) are regular core commands registered at boot. Global Shortcut is a thin layer: Tauri's `tauri-plugin-global-shortcut` + a Rust emit on press, and a webview listener that focuses the command bar.

**Tech Stack:** TypeScript 5 + Vitest for all new core code. `tauri-plugin-global-shortcut` ^2.2 (Rust) and `@tauri-apps/plugin-global-shortcut` ^2.2 (TS). No new deps in `@atlas/core`. No changes to `@atlas/sdk`.

**Prerequisite reading:**
- Spec: `docs/superpowers/specs/2026-04-19-atlas-1-v1-design.md` — **Rituals** and **Global Shortcut** sections.
- M2 plan: establishes `CommandRegistry`, `EventBus`, `VaultFs`.
- M3 plan: establishes the Tauri capability + dialog plugin pattern (Task 8 mirrors that for global-shortcut).
- Reference implementations: `packages/core/src/commands/parser.ts` (a similar pure parser), `packages/core/src/plugins/plugin-loader.ts` (file-scan-and-dispatch pattern).

**Windows note:** Bash with forward slashes. Cargo on `PATH="/c/Users/jford/.cargo/bin:$PATH"`. `Write` tool may fail EEXIST; fall back to `cat > path << 'ENDOFFILE'` with single-quoted delimiter when content has `$` or backticks.

---

## File structure after M6

```
packages/core/src/
├── cron/
│   ├── cron-matcher.ts             # NEW — pure cron expression matcher
│   └── cron-matcher.test.ts
├── rituals/
│   ├── parser.ts                   # NEW — .atlas text → Ritual struct
│   ├── parser.test.ts
│   ├── runner.ts                   # NEW — RitualRunner (execute via commands)
│   ├── runner.test.ts
│   ├── registry.ts                 # NEW — RitualRegistry (load, schedule, run)
│   ├── registry.test.ts
│   └── defaults.ts                 # NEW — default morning.atlas + evening.atlas
├── runtime.ts                      # MODIFIED — construct + expose RitualRegistry
└── index.ts                        # MODIFIED — export new types

apps/console/src/
├── boot/
│   ├── global-shortcut.ts          # NEW — register shortcut, focus cmdbar
│   └── built-in-plugins.ts         # (unchanged)
├── main.ts                         # MODIFIED — init rituals, init global-shortcut
└── shell/
    └── core-commands.ts            # MODIFIED — add ritual.run, ritual.list

src-tauri/
├── Cargo.toml                      # MODIFIED — add tauri-plugin-global-shortcut
├── src/lib.rs                      # MODIFIED — register plugin
└── capabilities/default.json       # MODIFIED — add global-shortcut perms

apps/console/package.json           # MODIFIED — add @tauri-apps/plugin-global-shortcut
```

---

## Task 1: Cron matcher (TDD)

A minimal matcher. Supports standard 5-field cron (`minute hour day-of-month month day-of-week`) with each field being either `*` or a single integer. Ranges and steps are deferred.

**Files:**
- Create: `packages/core/src/cron/cron-matcher.ts`
- Create: `packages/core/src/cron/cron-matcher.test.ts`

### Steps

- [ ] **Step 1: Write failing tests** at `packages/core/src/cron/cron-matcher.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCron, matches } from "./cron-matcher.js";

describe("parseCron", () => {
  it("parses the canonical 5-field form", () => {
    expect(parseCron("0 8 * * *")).toEqual({
      minute: 0,
      hour: 8,
      day: "*",
      month: "*",
      dow: "*",
    });
  });

  it("treats `*` as wildcard", () => {
    expect(parseCron("* * * * *")).toEqual({
      minute: "*",
      hour: "*",
      day: "*",
      month: "*",
      dow: "*",
    });
  });

  it("parses each field as integer when numeric", () => {
    expect(parseCron("30 14 15 6 3")).toEqual({
      minute: 30,
      hour: 14,
      day: 15,
      month: 6,
      dow: 3,
    });
  });

  it("returns null for non-5-field input", () => {
    expect(parseCron("0 8")).toBeNull();
    expect(parseCron("0 8 * * * *")).toBeNull();
    expect(parseCron("")).toBeNull();
  });

  it("returns null for non-numeric / non-wildcard tokens", () => {
    expect(parseCron("a b c d e")).toBeNull();
    expect(parseCron("*/5 * * * *")).toBeNull();
    expect(parseCron("0-15 * * * *")).toBeNull();
  });
});

describe("matches", () => {
  it("matches when the Date lands exactly on a numeric field", () => {
    const expr = parseCron("0 8 * * *")!;
    const d = new Date(2026, 3, 20, 8, 0, 0);
    expect(matches(expr, d)).toBe(true);
  });

  it("does not match when the minute differs", () => {
    const expr = parseCron("0 8 * * *")!;
    const d = new Date(2026, 3, 20, 8, 1, 0);
    expect(matches(expr, d)).toBe(false);
  });

  it("does not match when the hour differs", () => {
    const expr = parseCron("0 8 * * *")!;
    const d = new Date(2026, 3, 20, 9, 0, 0);
    expect(matches(expr, d)).toBe(false);
  });

  it("wildcard matches any value in that field", () => {
    const expr = parseCron("* * * * *")!;
    for (const hh of [0, 7, 23]) {
      for (const mm of [0, 30, 59]) {
        const d = new Date(2026, 3, 20, hh, mm, 0);
        expect(matches(expr, d)).toBe(true);
      }
    }
  });

  it("matches on day-of-month when specified", () => {
    const expr = parseCron("0 0 15 * *")!;
    expect(matches(expr, new Date(2026, 3, 15, 0, 0, 0))).toBe(true);
    expect(matches(expr, new Date(2026, 3, 16, 0, 0, 0))).toBe(false);
  });

  it("matches on month (1-12) when specified", () => {
    const expr = parseCron("0 0 1 6 *")!;
    expect(matches(expr, new Date(2026, 5, 1, 0, 0, 0))).toBe(true); // june is month 5 in Date, 6 in cron
    expect(matches(expr, new Date(2026, 4, 1, 0, 0, 0))).toBe(false);
  });

  it("matches on day-of-week (0-6, Sunday = 0)", () => {
    // 2026-04-20 is a Monday (Date.getDay() === 1)
    const expr = parseCron("0 9 * * 1")!;
    expect(matches(expr, new Date(2026, 3, 20, 9, 0, 0))).toBe(true);
    expect(matches(expr, new Date(2026, 3, 21, 9, 0, 0))).toBe(false); // Tuesday
  });

  it("ignores seconds — only minute resolution matters", () => {
    const expr = parseCron("0 8 * * *")!;
    expect(matches(expr, new Date(2026, 3, 20, 8, 0, 45))).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm --filter @atlas/core test src/cron/cron-matcher.test.ts
```
Expected: module not found.

- [ ] **Step 3: Write `packages/core/src/cron/cron-matcher.ts`**

```ts
export type CronField = number | "*";

export interface CronExpr {
  minute: CronField;
  hour: CronField;
  day: CronField;
  month: CronField;
  dow: CronField;
}

function parseField(s: string): CronField | null {
  if (s === "*") return "*";
  if (!/^\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a 5-field cron expression: `minute hour day month dow`.
 * Each field is `*` or a non-negative integer. Returns null on malformed input.
 */
export function parseCron(source: string): CronExpr | null {
  const tokens = source.trim().split(/\s+/);
  if (tokens.length !== 5) return null;
  const [mi, ho, da, mo, dw] = tokens.map(parseField);
  if (mi === null || ho === null || da === null || mo === null || dw === null) {
    return null;
  }
  return { minute: mi, hour: ho, day: da, month: mo, dow: dw };
}

function fieldMatches(field: CronField, value: number): boolean {
  return field === "*" || field === value;
}

/**
 * Does `d` fall inside the minute that matches `expr`?
 * Seconds are ignored. Month is 1-12 (Date.getMonth is 0-11 so we add 1).
 * Day-of-week is 0-6 with Sunday = 0.
 */
export function matches(expr: CronExpr, d: Date): boolean {
  return (
    fieldMatches(expr.minute, d.getMinutes()) &&
    fieldMatches(expr.hour, d.getHours()) &&
    fieldMatches(expr.day, d.getDate()) &&
    fieldMatches(expr.month, d.getMonth() + 1) &&
    fieldMatches(expr.dow, d.getDay())
  );
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @atlas/core test src/cron/cron-matcher.test.ts
```
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cron/
git commit -m "feat(core): minimal 5-field cron matcher"
```

---

## Task 2: Ritual parser (TDD)

Parses `.atlas` text into a structured `Ritual`:
- `lines`: command lines in order (leading `/` stripped is optional)
- `directives`: `{ cron?, on?, haltOnError }` from `# @directive` lines at the top of the file
- Blank lines and `#` comments (except `@directive` comments) are ignored

**Files:**
- Create: `packages/core/src/rituals/parser.ts`
- Create: `packages/core/src/rituals/parser.test.ts`

### Steps

- [ ] **Step 1: Write failing tests** at `packages/core/src/rituals/parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseRitual } from "./parser.js";

describe("parseRitual", () => {
  it("parses a simple multi-line ritual", () => {
    const src = [
      "/journal.today",
      "/tasks.list",
      "/habits.checkin workout",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.lines).toEqual([
      "/journal.today",
      "/tasks.list",
      "/habits.checkin workout",
    ]);
    expect(r.directives).toEqual({});
  });

  it("ignores blank lines and comments (non-directive #)", () => {
    const src = [
      "# morning ritual",
      "",
      "/journal.today",
      "# pause",
      "/tasks.list",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.lines).toEqual(["/journal.today", "/tasks.list"]);
  });

  it("captures @cron directive", () => {
    const src = ["# @cron 0 8 * * *", "/journal.today"].join("\n");
    const r = parseRitual(src);
    expect(r.directives.cron).toBe("0 8 * * *");
    expect(r.lines).toEqual(["/journal.today"]);
  });

  it("captures @on directive", () => {
    const src = ["# @on app:ready", "/tasks.list"].join("\n");
    const r = parseRitual(src);
    expect(r.directives.on).toBe("app:ready");
  });

  it("captures @halt-on-error directive as boolean", () => {
    const src = ["# @halt-on-error", "/tasks.list"].join("\n");
    const r = parseRitual(src);
    expect(r.directives.haltOnError).toBe(true);
  });

  it("captures multiple directives", () => {
    const src = [
      "# @cron 0 8 * * *",
      "# @halt-on-error",
      "/journal.today",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.directives).toEqual({
      cron: "0 8 * * *",
      haltOnError: true,
    });
  });

  it("trims whitespace and tolerates extra spaces", () => {
    const src = [
      "   # @cron 0 8 * * *   ",
      "   /tasks.list   ",
      "",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.directives.cron).toBe("0 8 * * *");
    expect(r.lines).toEqual(["/tasks.list"]);
  });

  it("returns empty ritual for empty input", () => {
    expect(parseRitual("")).toEqual({ lines: [], directives: {} });
    expect(parseRitual("\n\n\n")).toEqual({ lines: [], directives: {} });
  });

  it("preserves lines without a leading slash", () => {
    // Commands can be invoked with or without / — the REPL strips it.
    // The runner passes lines verbatim to parseCommand which tolerates both.
    const src = "tasks.list";
    expect(parseRitual(src).lines).toEqual(["tasks.list"]);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @atlas/core test src/rituals/parser.test.ts
```

- [ ] **Step 3: Write `packages/core/src/rituals/parser.ts`**

```ts
export interface RitualDirectives {
  /** Cron expression (5-field). If set, the ritual fires on matching minutes. */
  cron?: string;
  /** Event name. If set, the ritual fires when that event is emitted. */
  on?: string;
  /** If true, the runner stops at the first failing command. Default false. */
  haltOnError?: boolean;
}

export interface Ritual {
  /** One entry per executable line. Leading `/` is optional — callers that
   * invoke via the command parser pass each line through unchanged. */
  lines: string[];
  directives: RitualDirectives;
}

const DIRECTIVE_LINE = /^#\s*@([a-z-]+)(?:\s+(.*))?$/;

/**
 * Parse a `.atlas` ritual file.
 *
 *   # comment          (ignored unless it starts with `@`)
 *   # @cron 0 8 * * *  (directive)
 *   # @on app:ready    (directive)
 *   # @halt-on-error   (directive, no argument)
 *   /some.command args
 *   blank lines are ignored
 */
export function parseRitual(source: string): Ritual {
  const lines: string[] = [];
  const directives: RitualDirectives = {};

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;

    if (line.startsWith("#")) {
      const m = line.match(DIRECTIVE_LINE);
      if (m) {
        const [, name, value] = m;
        switch (name) {
          case "cron":
            if (value) directives.cron = value.trim();
            break;
          case "on":
            if (value) directives.on = value.trim();
            break;
          case "halt-on-error":
            directives.haltOnError = true;
            break;
          // Unknown directives are silently ignored.
        }
      }
      continue;
    }

    lines.push(line);
  }

  return { lines, directives };
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @atlas/core test src/rituals/parser.test.ts
```
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rituals/parser.ts packages/core/src/rituals/parser.test.ts
git commit -m "feat(core): ritual parser with directive support"
```

---

## Task 3: Ritual runner (TDD)

Runs a parsed ritual through the command registry. Substitutes `$arg0`, `$arg1`, ..., and named `$date` / `$name` / etc. passed in `args`. Halts on error if directive set.

**Files:**
- Create: `packages/core/src/rituals/runner.ts`
- Create: `packages/core/src/rituals/runner.test.ts`

### Steps

- [ ] **Step 1: Write failing tests** at `packages/core/src/rituals/runner.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { CommandRegistry } from "../commands/command-registry.js";
import { parseRitual } from "./parser.js";
import { runRitual, substituteArgs } from "./runner.js";

describe("substituteArgs", () => {
  it("returns the source unchanged when no vars referenced", () => {
    expect(substituteArgs("/tasks.list", {})).toBe("/tasks.list");
  });

  it("replaces $name references with matching arg values", () => {
    expect(substituteArgs("/journal.open $date", { date: "2026-04-20" })).toBe(
      "/journal.open 2026-04-20",
    );
  });

  it("replaces multiple distinct vars on the same line", () => {
    expect(
      substituteArgs("/greet $first $last", { first: "Jim", last: "Ford" }),
    ).toBe("/greet Jim Ford");
  });

  it("leaves unknown $var references intact", () => {
    expect(substituteArgs("/foo $missing", {})).toBe("/foo $missing");
  });
});

describe("runRitual", () => {
  it("invokes each line via the command registry in order", async () => {
    const reg = new CommandRegistry();
    const calls: string[] = [];
    reg.register({
      id: "a",
      run: async () => {
        calls.push("a");
      },
    });
    reg.register({
      id: "b",
      run: async () => {
        calls.push("b");
      },
    });
    const ritual = parseRitual(["/a", "/b"].join("\n"));
    await runRitual(ritual, { commands: reg });
    expect(calls).toEqual(["a", "b"]);
  });

  it("passes parsed args to the invoked command", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "task.add", run });
    const ritual = parseRitual("/task.add buy milk");
    await runRitual(ritual, { commands: reg });
    expect(run).toHaveBeenCalledWith(["buy", "milk"]);
  });

  it("substitutes $args before parsing each line", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "journal.open", run });
    const ritual = parseRitual("/journal.open $date");
    await runRitual(ritual, { commands: reg, args: { date: "2026-04-20" } });
    expect(run).toHaveBeenCalledWith(["2026-04-20"]);
  });

  it("continues past a failing line by default", async () => {
    const reg = new CommandRegistry();
    const calls: string[] = [];
    reg.register({
      id: "a",
      run: async () => {
        throw new Error("boom");
      },
    });
    reg.register({
      id: "b",
      run: async () => {
        calls.push("b");
      },
    });
    const ritual = parseRitual(["/a", "/b"].join("\n"));
    await runRitual(ritual, { commands: reg });
    expect(calls).toEqual(["b"]);
  });

  it("halts at the first failing line when haltOnError is set", async () => {
    const reg = new CommandRegistry();
    const calls: string[] = [];
    reg.register({
      id: "a",
      run: async () => {
        throw new Error("boom");
      },
    });
    reg.register({
      id: "b",
      run: async () => {
        calls.push("b");
      },
    });
    const ritual = parseRitual(["# @halt-on-error", "/a", "/b"].join("\n"));
    await expect(runRitual(ritual, { commands: reg })).rejects.toThrow(/boom/);
    expect(calls).toEqual([]);
  });

  it("skips lines with empty/invalid command ids", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "good", run });
    const ritual = parseRitual(["/", "/good"].join("\n"));
    await runRitual(ritual, { commands: reg });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @atlas/core test src/rituals/runner.test.ts
```

- [ ] **Step 3: Write `packages/core/src/rituals/runner.ts`**

```ts
import type { CommandApi } from "@atlas/sdk";
import { parseCommand } from "../commands/parser.js";
import type { Ritual } from "./parser.js";

export interface RunRitualOptions {
  commands: CommandApi;
  /** Named args available as `$name` substitutions in ritual lines. */
  args?: Record<string, string>;
}

/**
 * Replace `$name` references in `line` with values from `args`. Unknown
 * references are left intact.
 */
export function substituteArgs(line: string, args: Record<string, string>): string {
  return line.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (whole, name: string) => {
    return Object.prototype.hasOwnProperty.call(args, name) ? args[name]! : whole;
  });
}

/**
 * Execute a parsed ritual. Each line is substituted for `$args`, parsed via
 * the normal command parser, and invoked. If the ritual's `haltOnError`
 * directive is set, the first failing invocation rethrows; otherwise errors
 * are logged and the ritual continues.
 */
export async function runRitual(ritual: Ritual, opts: RunRitualOptions): Promise<void> {
  const { commands, args = {} } = opts;
  const halt = ritual.directives.haltOnError === true;

  for (const raw of ritual.lines) {
    const expanded = substituteArgs(raw, args);
    const parsed = parseCommand(expanded);
    if (!parsed.id) continue;
    try {
      await commands.invoke(parsed.id, parsed.args);
    } catch (err) {
      if (halt) throw err;
      // eslint-disable-next-line no-console
      console.error(`[atlas] ritual line failed: ${expanded}`, err);
    }
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @atlas/core test src/rituals/runner.test.ts
```
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rituals/runner.ts packages/core/src/rituals/runner.test.ts
git commit -m "feat(core): ritual runner with arg substitution and error handling"
```

---

## Task 4: Ritual registry (TDD)

Loads `.atlas` files from `<vault>/.atlas/rituals/`, seeds defaults on first run, starts a 1-minute cron scheduler, subscribes event triggers to the event bus, and exposes `listRituals()` + `runRitual(name, args)`.

**Files:**
- Create: `packages/core/src/rituals/defaults.ts`
- Create: `packages/core/src/rituals/registry.ts`
- Create: `packages/core/src/rituals/registry.test.ts`

### Steps

- [ ] **Step 1: Write `packages/core/src/rituals/defaults.ts`**

```ts
/**
 * Default rituals seeded into `<vault>/.atlas/rituals/` on first run.
 * Each entry is written verbatim to `<name>.atlas`.
 */
export const DEFAULT_RITUALS: Record<string, string> = {
  "morning.atlas": [
    "# morning ritual — opens your daily note + shows today's tasks",
    "# @cron 0 8 * * *",
    "",
    "/journal.today",
    "/tasks.list",
    "/habits.list",
    "",
  ].join("\n"),
  "evening.atlas": [
    "# evening ritual — archive done tasks + log a quick journal note",
    "",
    "/tasks.archive",
    "/journal.append end of day",
    "",
  ].join("\n"),
};
```

- [ ] **Step 2: Write failing tests** at `packages/core/src/rituals/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "../vault/node-vault-fs.js";
import { CommandRegistry } from "../commands/command-registry.js";
import { EventBus } from "../events/event-bus.js";
import { RitualRegistry } from "./registry.js";
import { DEFAULT_RITUALS } from "./defaults.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-rituals-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  return { dir, vault, commands, events };
}

describe("RitualRegistry", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("seeds default rituals on first load when the dir is missing", async () => {
    const env = await setup();
    dir = env.dir;
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    for (const name of Object.keys(DEFAULT_RITUALS)) {
      expect(await env.vault.exists(`.atlas/rituals/${name}`)).toBe(true);
    }
  });

  it("does not overwrite existing rituals on subsequent loads", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(".atlas/rituals/morning.atlas", "# custom\n/custom");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    expect(await env.vault.read(".atlas/rituals/morning.atlas")).toBe("# custom\n/custom");
  });

  it("lists rituals by bare name (no extension, no subfolders)", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(".atlas/rituals/morning.atlas", "/noop");
    await env.vault.write(".atlas/rituals/focus.atlas", "/noop");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    expect(reg.listRituals().sort()).toEqual(["evening", "focus", "morning"]);
  });

  it("runRitual executes the named ritual", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "tap",
      run: async () => {
        calls.push("tap");
      },
    });
    await env.vault.write(".atlas/rituals/test.atlas", "/tap");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    await reg.runRitual("test");
    expect(calls).toEqual(["tap"]);
  });

  it("runRitual with args substitutes `$name` vars", async () => {
    const env = await setup();
    dir = env.dir;
    const run = vi.fn();
    env.commands.register({ id: "echo", run });
    await env.vault.write(".atlas/rituals/t.atlas", "/echo $who");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    await reg.runRitual("t", { who: "jim" });
    expect(run).toHaveBeenCalledWith(["jim"]);
  });

  it("runRitual is a no-op for an unknown name", async () => {
    const env = await setup();
    dir = env.dir;
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    await expect(reg.runRitual("nope")).resolves.toBeUndefined();
  });

  it("@on event trigger fires the ritual when the matching event is emitted", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "hit",
      run: async () => {
        calls.push("hit");
      },
    });
    await env.vault.write(
      ".atlas/rituals/on-ready.atlas",
      ["# @on app:ready", "/hit"].join("\n"),
    );
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    env.events.emit("app:ready", undefined);
    // Emit is sync, but runRitual is async. Give microtasks a tick.
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(["hit"]);
  });

  it("@cron trigger fires when tick() is called at the matching minute", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "beep",
      run: async () => {
        calls.push("beep");
      },
    });
    await env.vault.write(
      ".atlas/rituals/daily.atlas",
      ["# @cron 0 8 * * *", "/beep"].join("\n"),
    );
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    // Not the scheduled minute
    await reg.tick(new Date(2026, 3, 20, 7, 59, 0));
    expect(calls).toEqual([]);

    // The scheduled minute
    await reg.tick(new Date(2026, 3, 20, 8, 0, 0));
    expect(calls).toEqual(["beep"]);
  });

  it("tick does not double-fire within the same minute", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "beep",
      run: async () => {
        calls.push("beep");
      },
    });
    await env.vault.write(
      ".atlas/rituals/daily.atlas",
      ["# @cron 0 8 * * *", "/beep"].join("\n"),
    );
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    const minute = new Date(2026, 3, 20, 8, 0, 0);
    await reg.tick(minute);
    await reg.tick(new Date(2026, 3, 20, 8, 0, 30)); // same minute, 30 s later
    expect(calls).toEqual(["beep"]);
  });
});
```

- [ ] **Step 3: Run — verify fail**

```bash
pnpm --filter @atlas/core test src/rituals/registry.test.ts
```

- [ ] **Step 4: Write `packages/core/src/rituals/registry.ts`**

```ts
import type { CommandApi, EventMap, VaultFs } from "@atlas/sdk";
import type { EventBus } from "../events/event-bus.js";
import { parseCron, matches, type CronExpr } from "../cron/cron-matcher.js";
import { parseRitual, type Ritual } from "./parser.js";
import { runRitual } from "./runner.js";
import { DEFAULT_RITUALS } from "./defaults.js";

const RITUALS_DIR = ".atlas/rituals";

interface LoadedRitual {
  name: string;
  ritual: Ritual;
  cron: CronExpr | null;
}

/**
 * Loads ritual files from the vault, seeds defaults on first run, wires
 * event-based triggers to the event bus, and provides a `tick(now)` entry
 * point the app calls every minute for cron-based triggers.
 */
export class RitualRegistry {
  private rituals = new Map<string, LoadedRitual>();
  private eventUnsubs: Array<() => void> = [];
  private lastCronTick: string | null = null;

  constructor(
    private readonly vault: VaultFs,
    private readonly commands: CommandApi,
    private readonly events: EventBus,
  ) {}

  async load(): Promise<void> {
    await this.seedIfEmpty();

    const files = await this.vault.list(RITUALS_DIR);
    this.rituals.clear();
    this.disposeEventSubs();

    for (const file of files) {
      if (!file.endsWith(".atlas")) continue;
      const name = file.slice(0, -".atlas".length);
      const source = await this.vault.read(`${RITUALS_DIR}/${file}`);
      const ritual = parseRitual(source);
      const cron = ritual.directives.cron ? parseCron(ritual.directives.cron) : null;
      this.rituals.set(name, { name, ritual, cron });

      if (ritual.directives.on) {
        const event = ritual.directives.on as keyof EventMap;
        const off = this.events.on(event, () => {
          void this.runRitual(name);
        });
        this.eventUnsubs.push(off);
      }
    }
  }

  listRituals(): string[] {
    return [...this.rituals.keys()];
  }

  async runRitual(name: string, args: Record<string, string> = {}): Promise<void> {
    const entry = this.rituals.get(name);
    if (!entry) return;
    await runRitual(entry.ritual, { commands: this.commands, args });
  }

  /** Call once per minute (or on any cadence — deduped per clock-minute). */
  async tick(now: Date = new Date()): Promise<void> {
    const key = minuteKey(now);
    if (key === this.lastCronTick) return;
    this.lastCronTick = key;
    for (const entry of this.rituals.values()) {
      if (!entry.cron) continue;
      if (matches(entry.cron, now)) {
        await this.runRitual(entry.name);
      }
    }
  }

  dispose(): void {
    this.disposeEventSubs();
    this.rituals.clear();
  }

  private disposeEventSubs(): void {
    for (const off of this.eventUnsubs) off();
    this.eventUnsubs = [];
  }

  private async seedIfEmpty(): Promise<void> {
    const existing = await this.vault.list(RITUALS_DIR);
    if (existing.length > 0) return;
    for (const [name, body] of Object.entries(DEFAULT_RITUALS)) {
      const path = `${RITUALS_DIR}/${name}`;
      if (!(await this.vault.exists(path))) {
        await this.vault.write(path, body);
      }
    }
  }
}

function minuteKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}
```

- [ ] **Step 5: Run — verify pass**

```bash
pnpm --filter @atlas/core test src/rituals/registry.test.ts
```
Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/rituals/defaults.ts packages/core/src/rituals/registry.ts packages/core/src/rituals/registry.test.ts
git commit -m "feat(core): ritual registry with cron + event triggers and default seeds"
```

---

## Task 5: Wire RitualRegistry into the runtime + core commands

Now the runtime exposes `rituals: RitualRegistry`. The shell registers `/ritual.run <name>` and `/ritual.list` core commands. main.ts calls `runtime.rituals.load()` + starts a 60-second tick interval.

**Files:**
- Modify: `packages/core/src/runtime.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/console/src/shell/core-commands.ts`
- Modify: `apps/console/src/main.ts`

### Steps

- [ ] **Step 1: Update `packages/core/src/runtime.ts`**

Read the current runtime.ts. Changes:
1. `import { RitualRegistry } from "./rituals/registry.js";`
2. Add `rituals: RitualRegistry` to the `Runtime` interface.
3. In `createRuntime`, construct it after `xp.load()`:
   ```ts
   const rituals = new RitualRegistry(vault, commands, events);
   ```
4. Include `rituals` in the returned `Runtime`.
5. In the `load()` method on the returned runtime, call `await rituals.load()` AFTER `await plugins.loadAll()` — plugins must register their commands first so ritual lines can reference them.

Read the full file, then make the targeted edits.

- [ ] **Step 2: Update `packages/core/src/index.ts`** to export the registry + types:

```ts
export { RitualRegistry } from "./rituals/registry.js";
export { parseRitual } from "./rituals/parser.js";
export { runRitual } from "./rituals/runner.js";
export type { Ritual, RitualDirectives } from "./rituals/parser.js";
```

Add these near the existing `./plugins/*` re-exports.

- [ ] **Step 3: Update `apps/console/src/shell/core-commands.ts`**

Add two new commands at the end of `registerCoreCommands(runtime)`:

```ts
runtime.commands.register({ id: "ritual.run", hint: "/ritual.run <name>", run: async (args) => {
  const name = args[0];
  if (!name) return;
  await runtime.rituals.runRitual(name);
}});
runtime.commands.register({ id: "ritual.list", hint: "/ritual.list", run: () => {
  const names = runtime.rituals.listRituals();
  // eslint-disable-next-line no-console
  console.log(`rituals (${names.length}):\n${names.map((n) => "  " + n).join("\n")}`);
}});
```

Read the current file first to find the right insertion point, then Edit.

- [ ] **Step 4: Update `apps/console/src/main.ts`** to start the cron tick after rituals load.

Read main.ts. The current structure (as of M4):
```ts
const runtime = await createRuntime(...);
await runtime.load();                          // loads plugins.json + rituals via Task 5 Step 1 changes
const { loadBuiltInPlugins } = await import("./boot/built-in-plugins.js");
await loadBuiltInPlugins(runtime);
await initShell(runtime);
```

The order is: createRuntime → load (plugins from json, then rituals) → load built-ins → init shell. Problem: built-in plugins load AFTER rituals.load(), so ritual lines referencing plugin commands like `/tasks.list` won't find them at `load` time — but they only matter at runtime, not load time. Rituals are parsed at load, executed later when tick/event/command fires. By that point built-ins are loaded. So the order is fine.

**BUT** — if a ritual has `# @on app:ready`, and `events.emit("app:ready")` fires inside `runtime.load()` before built-ins load, the ritual runs before built-ins exist. Look at runtime.ts: yes, `events.emit("app:ready")` is inside `load()` after plugins.loadAll(). Our `runtime.load()` calls `plugins.loadAll()` then `rituals.load()` then `emit app:ready`. So the order is: plugins (json-based) load → rituals load + subscribe to app:ready → emit app:ready → but built-ins still haven't loaded.

Fix the order in main.ts: load built-ins BEFORE runtime.load(), OR move the `app:ready` emit to after built-ins load, OR change runtime.load() to not emit.

Simplest: restructure main.ts so the app:ready emit happens after both plugins.json AND built-ins are loaded AND rituals are loaded. Edit runtime.ts's load() to NOT emit app:ready (make it the caller's responsibility), and have main.ts emit it at the right moment.

Actually, simpler: move app:ready emission from runtime.load() to main.ts, after everything is wired.

Update `packages/core/src/runtime.ts`:
```ts
// in the return statement's load() method:
async load() {
  await plugins.loadAll();
  await rituals.load();
  // Note: events.emit("app:ready", undefined) moved to main.ts caller
},
```

Remove the `events.emit("app:ready", undefined)` line from runtime.ts.

Update `apps/console/src/main.ts`:
```ts
const runtime = await createRuntime(...);
await runtime.load();
const { loadBuiltInPlugins } = await import("./boot/built-in-plugins.js");
await loadBuiltInPlugins(runtime);
await initShell(runtime);

// Start the ritual cron scheduler (1-minute tick).
const cronInterval = window.setInterval(() => {
  void runtime.rituals.tick();
}, 60_000);
// (cronInterval isn't cleaned up — process lifetime.)

// App is fully wired; fire the ready event.
runtime.events.emit("app:ready", undefined);
```

Do both edits: remove the emit from runtime.ts load(), add it + the cron setInterval in main.ts. Apply in BOTH the onboarding and normal-boot branches of main.ts.

- [ ] **Step 5: Update the runtime integration test**

The integration test in `packages/core/src/plugins/runtime.test.ts` currently calls `runtime.load()` and implicitly expects it to be a no-op for the `app:ready` emit. Since we're removing that emit from load(), the test should still pass — it doesn't assert anything about app:ready. Run to confirm:

```bash
pnpm --filter @atlas/core test src/plugins/runtime.test.ts
```
Expected: 3 passed.

- [ ] **Step 6: Full core test suite**

```bash
pnpm --filter @atlas/core test
```
Expected: all pass. Count: 58 M2 + 14 cron + 9 parser + 10 runner + 9 registry = **100**.

If the Windows tmpdir flakiness hits the xp-store test, re-run once.

- [ ] **Step 7: Typecheck + build + smoke**

```bash
pnpm typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/runtime.ts packages/core/src/index.ts apps/console/src/shell/core-commands.ts apps/console/src/main.ts
git commit -m "feat(runtime): integrate rituals registry, expose ritual.run and ritual.list"
```

---

## Task 6: Tauri global-shortcut plugin — Rust install

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

### Steps

- [ ] **Step 1: Add the Rust crate to `src-tauri/Cargo.toml`**

Current `[dependencies]` section:
```toml
[dependencies]
tauri = { version = "2.1", features = [] }
tauri-plugin-dialog = "2.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

Replace with:
```toml
[dependencies]
tauri = { version = "2.1", features = [] }
tauri-plugin-dialog = "2.2"
tauri-plugin-global-shortcut = "2.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

- [ ] **Step 2: Register the plugin in `src-tauri/src/lib.rs`**

Current builder chain includes `.plugin(tauri_plugin_dialog::init())`. Add the global-shortcut plugin right after. The full updated `run()` body:

```rust
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(vault::VaultRoot::default())
        .invoke_handler(tauri::generate_handler![
            vault::set_vault_root,
            vault::get_vault_root,
            vault::vault_read,
            vault::vault_write,
            vault::vault_append,
            vault::vault_list,
            vault::vault_exists,
            vault::vault_remove,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running Atlas 1");
}
```

- [ ] **Step 3: Add permissions to `src-tauri/capabilities/default.json`**

Current permissions array:
```json
  "permissions": [
    "core:default",
    "core:window:default",
    "core:webview:default",
    "dialog:default"
  ]
```

Replace with:
```json
  "permissions": [
    "core:default",
    "core:window:default",
    "core:webview:default",
    "dialog:default",
    "global-shortcut:default"
  ]
```

- [ ] **Step 4: Verify Rust compiles**

```bash
export PATH="/c/Users/jford/.cargo/bin:$PATH" && cd /c/Users/jford/OneDrive/Projects/Atlas-1/src-tauri && cargo check && cd ..
```
Expected: `Finished \`dev\` profile ...`. First compile downloads the crate; budget 3–5 min. Use Bash timeout 600000.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/Cargo.lock
git commit -m "feat(tauri): install global-shortcut plugin"
```

---

## Task 7: Webview global-shortcut — register + focus cmdbar

**Files:**
- Modify: `apps/console/package.json` (add JS companion)
- Create: `apps/console/src/boot/global-shortcut.ts`
- Modify: `apps/console/src/main.ts` (init shortcut after shell)

### Steps

- [ ] **Step 1: Add JS package to `apps/console/package.json`**

Current `dependencies` block includes `lit`, `@atlas/sdk`, `@atlas/core`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog`. Add:

```json
    "@tauri-apps/plugin-global-shortcut": "^2.2.0"
```

Run install:

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm install
```

- [ ] **Step 2: Create `apps/console/src/boot/global-shortcut.ts`**

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";

const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";

/**
 * Register a system-wide hotkey that brings Atlas to the foreground and
 * focuses the command bar. The shortcut string uses Tauri's format, e.g.
 * "CommandOrControl+Shift+Space". Pass null/empty to disable.
 *
 * Returns a disposer that unregisters the shortcut.
 */
export async function initGlobalShortcut(
  shortcut: string | null,
): Promise<() => Promise<void>> {
  if (!shortcut) return async () => {};

  try {
    await register(shortcut, async (event) => {
      if (event.state !== "Pressed") return;
      const win = getCurrentWindow();
      try {
        await win.show();
        await win.setFocus();
      } catch {
        // ignore — the window may already be visible and focused
      }
      const input = document.querySelector<HTMLInputElement>(".cmdbar .in");
      input?.focus();
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[atlas] failed to register global shortcut "${shortcut}":`, err);
    return async () => {};
  }

  return async () => {
    try {
      await unregister(shortcut);
    } catch {
      // ignore
    }
  };
}
```

- [ ] **Step 3: Call it from `apps/console/src/main.ts`** after `initShell(runtime)` in both the onboarding and normal-boot branches.

Read main.ts. Find the `await initShell(runtime);` lines (there are two — inside onboarding `onComplete` and in the normal-boot path). After each, add:

```ts
const { initGlobalShortcut } = await import("./boot/global-shortcut.js");
await initGlobalShortcut(runtime.config.get().globalShortcut);
```

(The onboarding branch uses `rt` instead of `runtime` — adjust accordingly.)

Also, the `config` field already has `globalShortcut` (set during M3) — the default value in `DEFAULT_CONFIG` is `"CommandOrControl+Shift+Space"`, so this works out of the box.

- [ ] **Step 4: Typecheck + build**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build
```
Expected: both green.

- [ ] **Step 5: Playwright smoke**

```bash
pnpm test:e2e
```
Expected: 1 passed (initGlobalShortcut is gated behind isTauri — in non-Tauri mode it's never called).

- [ ] **Step 6: Commit**

```bash
git add apps/console/package.json pnpm-lock.yaml apps/console/src/boot/global-shortcut.ts apps/console/src/main.ts
git commit -m "feat(console): register global shortcut and focus cmdbar on trigger"
```

---

## Task 8: Manual Tauri verification + milestone tag

**Files:** none — verification only.

### Steps

- [ ] **Step 1: Full test + build + cargo sweep**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && \
  pnpm typecheck && \
  pnpm test && \
  pnpm --filter @atlas/console build && \
  pnpm test:e2e && \
  export PATH="/c/Users/jford/.cargo/bin:$PATH" && cd src-tauri && cargo check && cd ..
```
All should be green. Total test count: 100 core + 9 console + 18 tasks + 13 journal + 21 habits = **161**.

- [ ] **Step 2: Start Tauri dev**

```bash
pnpm tauri:dev
```

- [ ] **Step 3: Verify rituals in the window**

1. Open devtools (Ctrl+Shift+I). In the Console, run:
   - `__atlas__` — not available (internal; ignore).
2. Via the REPL (press `/`):
   - Type `ritual.list` → devtools logs `rituals (2): morning / evening`.
3. Check `<vault>/.atlas/rituals/morning.atlas` and `evening.atlas` exist on disk.
4. Type `ritual.run evening` → tasks.archive + journal.append run in sequence. Check `<vault>/tasks/archive/<YYYY-MM>.md` grows (if there were done tasks) and today's journal gets a new `end of day` line.
5. Type `ritual.run morning` → journal.today, tasks.list, habits.list run in sequence. Journal screen should appear.

- [ ] **Step 4: Verify global shortcut**

1. Close the Atlas window, or put another app in the foreground.
2. Press `Ctrl+Shift+Space` (on Windows/Linux) or `Cmd+Shift+Space` (on macOS).
3. The Atlas window should come to focus and the bottom command bar should have a blinking cursor.

If the shortcut conflicts with another app already bound to it, the plugin register will log an error in devtools and the shortcut won't work. You can type a different binding via the REPL:
- `/accent` already exists as a config-setting command pattern; we don't yet have `/keybind` in v1. To change the shortcut, edit `<vault>/.atlas/config.json` → `globalShortcut` → restart Atlas.

- [ ] **Step 5: Tag the milestone**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && git tag -a m6-rituals-shortcut -m "M6: rituals + system-wide global shortcut"
```

- [ ] **Step 6: Confirm final state**

```bash
git status
git log --oneline | head -12
git tag | grep m
```
Expected: clean tree, `m6-rituals-shortcut` tag present, all 6 milestone tags in sequence.

---

## Definition of done

M6 is complete when:

1. `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `cargo check` all pass.
2. **161 tests** across 6 workspace packages all green.
3. `<vault>/.atlas/rituals/morning.atlas` and `evening.atlas` are seeded on first run with sensible defaults.
4. `/ritual.list` via REPL logs the installed rituals.
5. `/ritual.run <name>` executes the ritual via the normal command registry; `$arg` substitution works when args are passed.
6. `# @on app:ready` in a ritual fires it at app boot; `# @cron 0 8 * * *` fires it at the scheduled minute via the 60-second `tick()` loop.
7. Global shortcut `CommandOrControl+Shift+Space` focuses the Atlas window and the command bar from any app.
8. Git clean, tagged `m6-rituals-shortcut`.

Out of scope (v2+):
- Ritual scripting upgrades: conditionals, loops, variables beyond `$arg`, piping output to the next line.
- `/ritual.edit <name>` opening in the OS editor (needs `tauri-plugin-shell`).
- Rebinding the global shortcut from a settings screen (Settings arrives in M7; for now, edit config.json directly).
- Plugin-shipped ritual templates auto-installed to the vault (the scaffolding is there via `DEFAULT_RITUALS`; plugin hook is a v2 wiring).
- Multiple shortcuts (e.g. separate shortcut for capture-task only).

## Risks and mitigations

- **Cron matcher simplicity.** We only support `*` and single integers. Users expecting ranges (`1-5`), steps (`*/15`), or lists (`1,3,5`) won't get them. Document the limitation; v2 extends.
- **Global shortcut conflict.** If `Ctrl+Shift+Space` is already taken, register fails silently (error in devtools). Users edit config.json to pick another key.
- **1-minute tick drift.** `setInterval(60_000)` may drift by seconds. Deduplication by `minuteKey` prevents double-fires but can miss a tick if the timer jitters across a minute boundary. Acceptable for daily-granularity triggers. A v2 scheduler would use a wake-timer aligned to minute boundaries.
- **`app:ready` emission timing.** Moving the emit to main.ts (after built-ins load) is a correctness fix for ritual `@on app:ready` triggers. The `@atlas/core` integration test in `runtime.test.ts` doesn't assert `app:ready` — it should still pass after the move.
