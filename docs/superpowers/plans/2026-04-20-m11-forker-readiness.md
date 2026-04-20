# M11 — Forker Readiness + Plugin-State Dedup (Tier 2 Group B + C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four remaining Tier-2 findings so the Atlas 1 repo is genuinely forkable by a stranger and the plugin-loader story has one canonical code path.

**Architecture:** Four independent tasks. TSDoc pass is pure docs (safe to do first). The plugin template + scaffold script is new files only, no churn. GitHub repo polish is operational (gh CLI). The plugin-state dedup is the only non-trivial refactor — it unifies the `.atlas/plugins.json` type surface and routes built-in loading through `PluginLoader` so there is one lifecycle path.

**Tech Stack:** TypeScript (SDK + core), Node script (scaffold), gh CLI (repo polish), JS + JSDoc (template plugin).

---

## File Structure

**Create:**
- `plugins/template/main.js` — minimal Plugin class with one command, one XP award, one vault write, one event subscription
- `plugins/template/manifest.json` — standard manifest matching the three built-ins
- `plugins/template/package.json` — `"private": true`, empty dependencies
- `plugins/template/README.md` — "copy this folder, rename, edit `main.js`" guidance
- `scripts/new-plugin.mjs` — CLI script driven by `pnpm new:plugin <id>` that copies the template and rewrites ids

**Modify:**
- `packages/sdk/src/index.ts` — add file-level JSDoc overview of the plugin authoring surface
- `packages/sdk/src/plugin.ts` — TSDoc on `Plugin`, `PluginContext`, `NavApi`, `UiApi`
- `packages/sdk/src/commands.ts` — TSDoc on `Command`, `CommandApi`
- `packages/sdk/src/events.ts` — keep the good existing comments; add anything missing
- `packages/sdk/src/vault.ts` — TSDoc on `VaultFs`
- `packages/sdk/src/xp.ts` — TSDoc on `XpEvent`, `XpState`, `XpApi`
- `packages/sdk/src/config.ts` — TSDoc on `AtlasConfig` fields
- `packages/core/src/plugins/plugin-loader.ts` — delete `PluginsJson` / `PluginsJsonEntry`, use `loadPluginState` / `PluginStateEntry` from `plugin-state.ts`; add `addStaticPlugin({ id, pluginClass })` entry point so built-ins flow through the same loader
- `apps/console/src/boot/built-in-plugins.ts` — call `pluginLoader.addStaticPlugin(...)` for each globbed module instead of hand-rolling the load path; capture the returned disposer
- `apps/console/src/main.ts` — call the disposer on `window.beforeunload` so built-ins get `onunload`
- `package.json` — add `"new:plugin": "node scripts/new-plugin.mjs"` under `scripts`
- `README.md` — one-liner mentioning `plugins/template/` and `pnpm new:plugin <id>`
- `CONTRIBUTING.md` — replace the inline MVP-plugin snippet in "Writing a plugin" with a pointer to the template
- `docs/TECH-DEBT.md` — flip rows #9, #10, #11, #12 from 🔴 to 🟢

**GitHub (operational, not code):**
- Flip `isTemplate` to `true`
- Add repo topics: `tauri`, `life-console`, `plain-text`, `plugin-architecture`, `local-first`, `typescript`, `desktop-app`
- Note: social preview image is parked for a later session (requires a manual screenshot upload)

**Out of scope:**
- Publishing `@atlas/sdk` to npm — `private: true` stays; forkers copy-paste for now.
- SDK tests — `packages/sdk/package.json` has `"no tests in sdk yet"`; leave as-is for this plan.

---

## Task 1: TSDoc pass on the SDK

**Why:** The SDK surface is small (6 files, ~100 lines) but mostly undocumented, so a plugin author has to infer behaviour from reference plugins. Every interface member should carry one concise line explaining what it does, what it returns, and any gotchas (e.g., command IDs are auto-namespaced).

**Files:**
- Modify: `packages/sdk/src/index.ts`, `plugin.ts`, `commands.ts`, `events.ts`, `vault.ts`, `xp.ts`, `config.ts`

- [ ] **Step 1: Add file-level overview to `packages/sdk/src/index.ts`**

At the top of the file (before the existing exports), add:

```ts
/**
 * @atlas/sdk — the public plugin authoring contract for Atlas 1.
 *
 * An Atlas plugin is a directory under `plugins/<id>/` with a `main.js` that
 * default-exports a class implementing {@link Plugin}. At load time, the core
 * constructs an instance, calls `onload(ctx)` with a {@link PluginContext},
 * and keeps the instance alive until shutdown, when `onunload(ctx)` is called.
 *
 * The context exposes seven capability APIs:
 *  - `ctx.vault`    — {@link VaultFs} scoped to `plugins/<id>/` (advisory; see CONTRIBUTING.md's "Plugin trust model")
 *  - `ctx.commands` — {@link CommandApi} to register slash commands
 *  - `ctx.events`   — {@link EventApi} to subscribe to and emit app-wide events
 *  - `ctx.xp`       — {@link XpApi} to award XP and read game state
 *  - `ctx.nav`      — {@link NavApi} to add entries to the screen nav
 *  - `ctx.ui`       — {@link UiApi} to register views for screens
 *
 * Start from `plugins/template/` and copy it with `pnpm new:plugin <id>`.
 * See the three built-in plugins (`plugins/tasks`, `plugins/journal`,
 * `plugins/habits`) for fuller patterns.
 */
```

- [ ] **Step 2: TSDoc the `Plugin` and `PluginContext` in `plugin.ts`**

For each interface and interface member, add a TSDoc block. Examples:

```ts
/**
 * The Plugin interface. Default-export a class implementing this from
 * your `main.js`. The runtime instantiates it once per app lifetime.
 */
export interface Plugin {
  /**
   * Called once after the plugin instance is constructed. Register commands,
   * views, nav items, and event listeners here. May be async. The ctx is the
   * only way to touch the runtime — do not import core modules directly.
   */
  onload(ctx: PluginContext): void | Promise<void>;

  /**
   * Called once at shutdown. Optional. Release any external resources
   * (timers, fetch aborts, DOM listeners on `window`). Disposers returned
   * by `commands.register`, `nav.register`, `ui.registerView` are called
   * automatically — you do not need to unregister them here.
   */
  onunload?(ctx: PluginContext): void | Promise<void>;
}
```

Do the same for `PluginContext`, `NavApi` (`register(item)` — describe the NavItem shape), and `UiApi` (`registerView(screenId, loader)` — document the loader contract: returns `{ render(el: HTMLElement): void; dispose?(): void }`).

- [ ] **Step 3: TSDoc `commands.ts`**

Document `Command` (fields: `id`, `title`, `hint`, `run`) and `CommandApi` (methods: `register`, `unregister`, `invoke`, `has`, `list`). On `Command.id`, explicitly note:

> For plugin commands, register the bare verb (e.g. `"add"`) — the runtime prefixes it with `<pluginId>.` to produce the final command id. Do not include a dot yourself; an error is thrown if you try.

That resolves the finding from the forker-readiness review.

- [ ] **Step 4: Verify `events.ts` is already well-commented**

Read the current file. If the `EventMap` augmentation pattern is explained and `EventApi` members have JSDoc, only touch missing members. The review praised this file as the only fully-commented one.

- [ ] **Step 5: TSDoc `vault.ts`**

Document `VaultFs` methods: `read(path)`, `write(path, content)`, `append(path, content)`, `remove(path)`, `exists(path)`, `list(path)`. Note that paths are relative to the plugin's scoped root (from inside a plugin) or the vault root (from inside core).

- [ ] **Step 6: TSDoc `xp.ts`**

Document `XpEvent` (fields), `XpState` (fields including `streak`), `XpApi` (`award({ amount, reason, kind })`, `getState()`, `onChange(listener)`). Mention that `gameMode: false` in config makes `award` a no-op.

- [ ] **Step 7: TSDoc `config.ts`**

Every `AtlasConfig` field gets a one-line comment explaining what it drives. Keep these terse — the type name + comment is the full docs for most forkers.

- [ ] **Step 8: Typecheck + tests**

Run: `pnpm typecheck && pnpm test`

Expected: 0 errors, 178+ tests pass. TSDoc changes don't affect runtime.

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/src/
git commit -m "docs(sdk): TSDoc every member + index.ts overview for plugin authors"
```

---

## Task 2: Plugin template + `pnpm new:plugin <id>` scaffold

**Why:** A forker's shortest path to "a working plugin" currently is copying one of the 200-line built-ins and trimming. Give them a 40-line reference and a one-command scaffold.

**Files:**
- Create: `plugins/template/main.js`, `manifest.json`, `package.json`, `README.md`
- Create: `scripts/new-plugin.mjs`
- Modify: `package.json` (root) — add `new:plugin` script
- Modify: `README.md`, `CONTRIBUTING.md`

- [ ] **Step 1: Create `plugins/template/main.js`**

```js
/**
 * @typedef {import("@atlas/sdk").Plugin} Plugin
 * @typedef {import("@atlas/sdk").PluginContext} PluginContext
 */

/**
 * Minimal Atlas 1 plugin. Copy this folder and edit main.js.
 *
 * Shows the four capabilities most plugins use:
 *   - ctx.commands.register  — slash commands
 *   - ctx.xp.award           — drip XP on user actions
 *   - ctx.vault.write        — persist plaintext to the scoped vault
 *   - ctx.events.on          — react to app-wide events
 */
export default class TemplatePlugin {
  /** @param {PluginContext} ctx */
  async onload(ctx) {
    // 1. Register a slash command. The `id` is auto-namespaced: the user
    //    types `/<plugin-id>.hello` in the command bar. Do NOT include a dot.
    const offHello = ctx.commands.register({
      id: "hello",
      hint: "log a friendly message, award 10 xp, and append to greetings.md",
      run: async () => {
        const line = `hi from ${ctx.pluginId} · ${new Date().toISOString()}\n`;
        await ctx.vault.append("greetings.md", line);
        ctx.xp.award({ amount: 10, reason: "said hello", kind: "xp" });
      },
    });

    // 2. Subscribe to an event.
    const offReady = ctx.events.on("app:ready", () => {
      // eslint-disable-next-line no-console
      console.log(`[${ctx.pluginId}] app ready`);
    });

    // 3. Stash the disposers so we can clean up on unload.
    this._disposers = [offHello, offReady];
  }

  /** @param {PluginContext} _ctx */
  async onunload(_ctx) {
    for (const off of this._disposers ?? []) off();
  }
}
```

- [ ] **Step 2: Create `plugins/template/manifest.json`**

```json
{
  "id": "template",
  "name": "Template Plugin",
  "version": "0.0.1",
  "atlas": "^0.10.0",
  "main": "main.js",
  "permissions": ["vault:plugins/template"]
}
```

- [ ] **Step 3: Create `plugins/template/package.json`**

```json
{
  "name": "@atlas-plugin/template",
  "version": "0.0.1",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 4: Create `plugins/template/README.md`**

```markdown
# Template Plugin

Copy this directory to make a new Atlas plugin:

```
pnpm new:plugin my-plugin
```

Then edit `plugins/my-plugin/main.js`. That scaffold renames the plugin id everywhere it appears, so `/my-plugin.hello` is the working command out of the gate.

See `plugins/tasks/`, `plugins/journal/`, and `plugins/habits/` for realistic plugins with parsers, views, XP, and more commands.
```

- [ ] **Step 5: Create `scripts/new-plugin.mjs`**

```js
#!/usr/bin/env node
/**
 * pnpm new:plugin <id>
 *
 * Copies plugins/template/ to plugins/<id>/ and rewrites the id in:
 *   - main.js (comments mentioning "template")
 *   - manifest.json ("id", "name")
 *   - package.json ("name")
 *   - README.md (one-liner)
 *
 * Refuses to overwrite an existing directory.
 */
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

const rawId = process.argv[2];
if (!rawId) {
  console.error("usage: pnpm new:plugin <id>");
  console.error('id must match /^[a-z][a-z0-9_-]{1,31}$/ (e.g., "my-plugin")');
  process.exit(1);
}
if (!/^[a-z][a-z0-9_-]{1,31}$/.test(rawId)) {
  console.error(`invalid id "${rawId}". must match /^[a-z][a-z0-9_-]{1,31}$/`);
  process.exit(1);
}

const src = join(repo, "plugins", "template");
const dest = join(repo, "plugins", rawId);
if (existsSync(dest)) {
  console.error(`plugins/${rawId}/ already exists. pick another id.`);
  process.exit(1);
}

await cp(src, dest, { recursive: true });

// Rewrite text files. Anything binary will be left alone.
const textFiles = ["main.js", "manifest.json", "package.json", "README.md"];
for (const name of textFiles) {
  const p = join(dest, name);
  if (!existsSync(p)) continue;
  let content = await readFile(p, "utf8");
  content = content
    .replaceAll("@atlas-plugin/template", `@atlas-plugin/${rawId}`)
    .replaceAll('"id": "template"', `"id": "${rawId}"`)
    .replaceAll('"name": "Template Plugin"', `"name": "${titleCase(rawId)}"`)
    .replaceAll("vault:plugins/template", `vault:plugins/${rawId}`)
    .replaceAll("Template Plugin", titleCase(rawId))
    .replaceAll("template", rawId);
  await writeFile(p, content, "utf8");
}

console.log(`created plugins/${rawId}/`);
console.log(`next: edit plugins/${rawId}/main.js, restart \`pnpm tauri:dev\`, try /${rawId}.hello`);

function titleCase(id) {
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
```

- [ ] **Step 6: Add the root script to `package.json`**

In the `scripts` block, add:

```json
"new:plugin": "node scripts/new-plugin.mjs"
```

- [ ] **Step 7: Verify the scaffold runs end-to-end**

Run (from repo root):

```bash
pnpm new:plugin smoke-test
```

Expected:
- `plugins/smoke-test/` created
- `plugins/smoke-test/main.js` has references to `smoke-test` in the commands + XP reason
- `plugins/smoke-test/manifest.json` has `"id": "smoke-test"` and `"name": "Smoke Test"`
- Script prints the "next: …" line

Clean up:

```bash
rm -rf plugins/smoke-test
```

- [ ] **Step 8: Update README + CONTRIBUTING**

In `README.md`, under "Build a distributable yourself", add a new subsection:

```markdown
## Write a plugin

The shortest path from zero to a working plugin:

```bash
pnpm new:plugin my-plugin
# edit plugins/my-plugin/main.js
pnpm tauri:dev
# in the command bar: /my-plugin.hello
```

Everything lives as plain files under `plugins/my-plugin/`. See `plugins/template/` and the three built-in plugins for the patterns.
```

In `CONTRIBUTING.md`, replace the minimum-viable-plugin code block (under "Writing a plugin") with:

```markdown
Start from `plugins/template/`. The fastest way:

```bash
pnpm new:plugin my-plugin
```

That copies the template, rewrites the id everywhere, and leaves you a working plugin to iterate on. Open `plugins/my-plugin/main.js` and add your own commands, views, and event handlers.
```

Leave the rest of the "Writing a plugin" section (discussing `Plugin`, `PluginContext`, etc.) intact.

- [ ] **Step 9: Commit**

```bash
git add plugins/template/ scripts/ package.json README.md CONTRIBUTING.md
git commit -m "feat(scaffold): add plugins/template + pnpm new:plugin <id> command"
```

---

## Task 3: Collapse `plugins.json` types + route built-ins through `PluginLoader`

**Why:** Two separate types (`PluginsJson`/`PluginsJsonEntry` in `plugin-loader.ts` vs `PluginState`/`PluginStateEntry` in `plugin-state.ts`) describe the same on-disk file. `loadBuiltInPlugins` forks the lifecycle — no `onunload` ever fires for built-ins, the manifest `permissions` and `atlas` range are ignored. Unifying removes a foot-gun and gives us one place to enforce things later.

**Files:**
- Modify: `packages/core/src/plugins/plugin-loader.ts`
- Modify: `apps/console/src/boot/built-in-plugins.ts`
- Modify: `apps/console/src/main.ts`

- [ ] **Step 1: Read both files to map the existing shape**

```bash
cat packages/core/src/plugins/plugin-loader.ts
cat packages/core/src/plugins/plugin-state.ts
cat apps/console/src/boot/built-in-plugins.ts
```

- [ ] **Step 2: Delete `PluginsJson` / `PluginsJsonEntry` from `plugin-loader.ts`**

Replace every reference in `plugin-loader.ts` with the types from `plugin-state.ts`:
- Import: `import { loadPluginState, type PluginState, type PluginStateEntry } from "./plugin-state.js"`
- `readManifest`: rename/delete it; use `loadPluginState(vault)` for the state read.
- The `path` field is optional on `PluginStateEntry` (matches real shape) — update any code that assumed `path` was always present.

- [ ] **Step 3: Add `addStaticPlugin` to `PluginLoader`**

At a minimum, the signature should be:

```ts
addStaticPlugin(args: {
  id: string;
  pluginClass: new () => Plugin;
  manifest?: { permissions?: string[]; atlas?: string };
}): Promise<() => Promise<void>>;
```

Behaviour:
- If the plugin id is in the "disabled" set (from `loadPluginState`), return a no-op disposer.
- Otherwise, instantiate, call `createContext({ pluginId, core })`, await `onload(ctx)`, and return a disposer that calls `onunload(ctx)`.
- Track internally so the loader's overall `unloadAll()` also cleans them up.

- [ ] **Step 4: Rewrite `built-in-plugins.ts` to call `addStaticPlugin`**

The built-in loader still uses `import.meta.glob` (that part is Vite-specific and has to stay in the webview), but for each module it should call `runtime.plugins.addStaticPlugin({ id, pluginClass: mod.default })` instead of constructing and calling `onload` itself. Keep the current disabled-plugin gate **only** if `addStaticPlugin` does not already handle it — otherwise delete the duplicate check.

The function should return a disposer that cleans up every plugin it added (collect the disposers returned by `addStaticPlugin`).

- [ ] **Step 5: Capture the disposer in `main.ts` and wire to `beforeunload`**

In `apps/console/src/main.ts`, the call site is currently:

```ts
await loadBuiltInPlugins(runtime);
```

Change it to:

```ts
const disposePlugins = await loadBuiltInPlugins(runtime);
window.addEventListener("beforeunload", () => {
  void disposePlugins();
});
```

(Accept that `beforeunload` may fire slightly too early to let an async unload fully complete — the Tauri webview will typically still process pending awaits before tearing down. Best-effort cleanup is the goal.)

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm test
```

Expected: 0 type errors; 178+ tests pass. Any pre-existing tests in `plugin-loader.test.ts` should still pass after the type unification.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/plugins/plugin-loader.ts apps/console/src/boot/built-in-plugins.ts apps/console/src/main.ts
git commit -m "refactor(plugins): unify plugins.json types + route built-ins through PluginLoader"
```

---

## Task 4: GitHub repo polish (operational)

**Files:** none (operational via `gh` CLI).

- [ ] **Step 1: Flip the repo to a Template repository**

Run:

```bash
gh repo edit dontcallmejames/atlas-1 --template
```

Expected: no output on success. Verify in the browser at https://github.com/dontcallmejames/atlas-1 — a "Use this template" button appears near "Code".

- [ ] **Step 2: Add repository topics**

Run:

```bash
gh repo edit dontcallmejames/atlas-1 \
  --add-topic tauri \
  --add-topic life-console \
  --add-topic plain-text \
  --add-topic plugin-architecture \
  --add-topic local-first \
  --add-topic typescript \
  --add-topic desktop-app
```

Expected: no output on success. Verify the topics appear on the repo homepage.

- [ ] **Step 3: Set the description + homepage**

Run:

```bash
gh repo edit dontcallmejames/atlas-1 \
  --description "Open-source life console — terminal × game HUD, local-first, plain-text vault, plugin-based. Forkable Tauri desktop app." \
  --homepage "https://github.com/dontcallmejames/atlas-1#readme"
```

- [ ] **Step 4: Social preview image — parked**

Upload requires a manual GitHub UI flow (Settings → Social preview → upload a 1280×640 PNG). The "game HUD" prototype in `design/` is a good source. Defer to a later session and note it in `docs/TECH-DEBT.md`'s deferred list.

- [ ] **Step 5: Verify the end state**

Run:

```bash
gh repo view dontcallmejames/atlas-1 --json isTemplate,repositoryTopics,description,homepageUrl
```

Expected JSON:
- `isTemplate: true`
- `repositoryTopics` contains all 7 topics
- `description` and `homepageUrl` match what was set

No commit needed — this task only touches remote repo metadata.

---

## Task 5: Final wrap — flip tech-debt rows

**Files:**
- Modify: `docs/TECH-DEBT.md`

- [ ] **Step 1: Flip rows #9, #10, #11, #12 to 🟢**

In the Tier 2 table, set the Status cell for all four rows. Leave the description columns unchanged.

- [ ] **Step 2: Add a "social preview image" note to the Deferred-to-v2 section**

Under the forker-readiness subsection of deferred items, add:

```markdown
- Social preview image for the GitHub repo (requires manual UI upload of a 1280×640 PNG).
```

- [ ] **Step 3: Final verification**

```bash
pnpm typecheck && pnpm test && (cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo test)
```

Expected: typecheck clean; 178+ JS tests pass; 4 Rust tests pass.

- [ ] **Step 4: Commit**

```bash
git add docs/TECH-DEBT.md
git commit -m "docs: mark Tier 2 Groups B + C complete"
```

---

## Self-review notes

**Scope coverage:** Tier-2 rows #9, #10, #11, #12 → Tasks 2, 1, 4, 3 respectively (plus Task 5 hygiene). No gaps.

**No placeholders:** every TSDoc example is literal. The scaffold script is a complete file. The git commands are exact.

**Type consistency:** `PluginStateEntry` (from `plugin-state.ts`) wins over `PluginsJsonEntry`. `addStaticPlugin` signature is specified once and used consistently.

**Risk:** Task 3 (plugin-state refactor) is the only task that touches runtime behavior meaningfully. Smoke-test in Tauri after: confirm built-ins still load, tasks/journal/habits still work, plugin enable/disable in Settings still persists correctly.
