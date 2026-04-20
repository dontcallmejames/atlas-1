# Performance Review — Atlas 1

## Summary
Atlas 1's overall performance posture is healthy for a v0.1 local-first desktop app — boot is lazy-import-driven, the webview bundle is ~120kB total, and hot paths (cron tick, event bus, XP append) are O(1) per call. The three concerns worth flagging are: (1) `js-yaml` being pulled into the webview just to parse a user's ~30-line `habits.yaml`, bloating the plugins chunk 3–4x; (2) `index.html` shipping ~103kB of pre-rendered static demo markup on every load; (3) the XP store replaying the entire JSONL log on every boot with no compaction strategy, which will linearly slow boot as the vault ages. Nothing in scope today visibly hurts UX.

## Measurements

Built output (`apps/console/dist/`):
- `index.html` — 102,977 bytes (large static shell with demo content)
- `console.css` — 41,031 bytes
- `assets/built-in-plugins-*.js` — 55,597 bytes (dominated by js-yaml)
- `assets/global-shortcut-*.js` — 14,836 bytes
- `assets/index-*.js` (two chunks) — 15,789 + 8,925 bytes
- All other chunks < 5kB each
- Total dist: ~286kB

Plugin source sizes: habits 264 LOC, journal 239 LOC, tasks 206 LOC.

Dependencies declared but unused in source: `lit` (`apps/console/package.json:14`) — no `import .* lit` anywhere under `apps/console/src`.

## Findings

### [MEDIUM] js-yaml bundled into webview for a single plugin's small config file
- **Location:** `plugins/habits/parser.js:1`, `plugins/habits/package.json:11`; bundled via `apps/console/src/boot/built-in-plugins.ts:8` (`import.meta.glob(..., { eager: true })`)
- **Issue:** The `habits` plugin uses `js-yaml` solely to parse/serialize `habits.yaml`, a user-authored file that is typically ~10–30 lines with a flat schema (id/name/xp). Because `built-in-plugins.ts` eagerly globs every plugin's `main.js` at build time, js-yaml is pulled into the main webview bundle. The built-in-plugins chunk is 55.6kB; inspecting it shows js-yaml is the dominant payload (starts with the js-yaml banner immediately after the two small imports).
- **Impact:** ~40–45kB of extra JS parsed on every cold boot, purely for YAML support that's trivially replaceable. Also a dependency surface (js-yaml has had schema-related CVEs historically).
- **Recommendation:** Replace with a hand-rolled parser for the fixed habits schema (the file is `habits:` followed by a list of `{id, name, xp}` — a 20-line regex/split parser covers it), or switch habits.yaml to habits.json. Expected chunk drop: 55kB → ~10kB.

### [MEDIUM] index.html ships ~103kB of static demo markup on every load
- **Location:** `apps/console/dist/index.html` (102,977 bytes, 9 embedded `<script|style|svg>` blocks; majority is hard-coded nav/stats/quests skeleton with placeholder data like `lvl 6`, `lvl 9`, hard-coded agent list, ASCII banner)
- **Issue:** The HTML contains a large pre-rendered "demo" shell that appears to be the design mock still embedded as the shipping layout. Much of this content is replaced/rewritten by shell init (`apps/console/src/shell/index.ts`) once the runtime is up, so it's paint-then-repaint rather than progressive.
- **Impact:** Adds ~100kB to every cold load and causes a visible content flash if the runtime hydrates over the demo text. On slow disks or with large vaults (where boot awaits `runtime.load()`), users see stale demo data first.
- **Recommendation:** Strip the static skeleton down to the bare mount points the shell wires to (`#screenNav`, `.cmdbar .in`, `.pane` containers, etc.) and let shell modules render their own content. Expected HTML drop: 103kB → ~8–15kB.

### [MEDIUM] XP store replays full JSONL log on every boot with no compaction
- **Location:** `packages/core/src/xp/xp-store.ts:30-43`
- **Issue:** `XpStore.load()` reads the entire `.atlas/xp.log` file, splits by newline, and JSON.parses every line on every boot. There is no snapshot/checkpoint and no cap on log growth. In `runtime.ts:37`, this blocks `createRuntime` because `await xp.load()` is on the critical boot path.
- **Impact:** For an "active" user awarding ~20 events/day, the log grows ~7300 lines/year. At 1M+ lines (multi-year heavy use, scripted awards, or accidental loops) boot cost becomes measurable (hundreds of ms of JSON.parse + string splitting). Also `raw.split("\n")` materializes the full line array in memory.
- **Recommendation:** (a) Periodically snapshot the reduced state to `.atlas/xp-state.json` and only replay events newer than the snapshot timestamp; (b) stream-parse line-by-line instead of splitting the whole buffer; (c) move `xp.load()` off the critical boot path — the shell doesn't need XP state until the first statusline render.

### [MEDIUM] Journal `listNoteDates` does N+1 directory walk on every view render
- **Location:** `plugins/journal/main.js:31-62`
- **Issue:** `listNoteDates` calls `vault.list(".")`, then `vault.list(y)` per year, then `vault.list(`${y}/${m}`)` per month. Over Tauri IPC this is 1 + Y + Y*12 round-trips (≈25 IPC calls for a 2-year vault, ~60 for 5 years). Every call crosses the webview→Rust boundary.
- **Impact:** Journal view open latency scales linearly with vault age. Not hot today (small test vault) but noticeable at scale or on slower disks.
- **Recommendation:** Add a `vault.listRecursive(path, glob)` or `vault.walk(path)` IPC command in `src-tauri/src/vault.rs` that returns all matching files in one shot; cache the result in-memory and invalidate on journal write.

### [LOW] Rust vault commands use blocking `fs` on the Tauri async runtime
- **Location:** `src-tauri/src/vault.rs:61,68,78,93,112,119` — all handlers are `#[tauri::command] pub fn` (sync) calling `std::fs::*`.
- **Issue:** Tauri v2 runs each command on its own thread by default (sync command = blocking thread from a pool), so this doesn't block the UI event loop — but it does tie up a worker per in-flight request. The blocking `Mutex<Option<PathBuf>>` in `VaultRoot` is also held across the full lock scope in `require_root` (small, fine today).
- **Impact:** Low. Becomes relevant only if many concurrent vault ops race (e.g. bulk imports, plugin doing parallel reads). Current flow is mostly serial.
- **Recommendation:** When a concurrency issue shows up, swap to `async fn` handlers using `tokio::fs`. Not urgent.

### [LOW] Habits `loadLog` reads every monthly log file on every access
- **Location:** `plugins/habits/main.js:29-43`
- **Issue:** `loadLog` lists `log/` and reads every `.jsonl` file, then concatenates parsed entries. Called from `checkin`, `list`, and from habit view renders. No caching.
- **Impact:** Grows O(months). Currently trivial; at 5 years = 60 files per habit interaction.
- **Recommendation:** Cache by month file + mtime, or restrict reads to the months actually needed for the current view (last-30-days view only needs ≤ 2 files).

### [LOW] Cron matcher runs O(rituals) per-minute with no indexing
- **Location:** `packages/core/src/rituals/registry.ts:68-78`, `packages/core/src/cron/cron-matcher.ts:46-54`
- **Issue:** `tick()` iterates every loaded ritual and calls `matches()` which does 5 integer comparisons. Minute dedupe via `minuteKey` prevents double-fire. No hot loop — runs once per 60s (see `apps/console/src/main.ts:58, 81`).
- **Impact:** None today. Would only matter with hundreds of cron rituals.
- **Recommendation:** No action needed.

### [LOW] Cron grammar is too restrictive — no ranges, steps, or lists
- **Location:** `packages/core/src/cron/cron-matcher.ts:11-34`
- **Issue:** Each field is `*` or a single integer. No `*/5`, no `1-5`, no `1,15,30`. Users wanting "every 5 minutes" must declare 12 rituals.
- **Impact:** Correctness/UX, not perf directly — but when users add many rituals to work around this, the per-tick loop grows.
- **Recommendation:** Extend parser to handle `*/N`, `a-b`, and `a,b,c`. Out of scope for a perf review but worth flagging.

### [LOW] Dead dependency: `lit` declared but never imported
- **Location:** `apps/console/package.json:14`
- **Issue:** `lit` is listed as a dependency but zero files under `apps/console/src/` import from it. Vite's tree-shaking should drop it from the bundle, but it still adds install time, lockfile noise, and supply-chain surface.
- **Impact:** Zero bundle impact (tree-shaken), minor install-time cost.
- **Recommendation:** Remove from `dependencies`.

## Quick wins

- Remove `lit` from `apps/console/package.json` — no source imports it.
- Strip demo markup out of `apps/console/index.html` down to real mount points (drops ~90kB HTML).
- Replace `js-yaml` in `plugins/habits/parser.js` with a 20-line hand-parser or switch habits.yaml to habits.json (drops ~40kB from the main bundle).
- Move `xp.load()` off the critical boot path in `packages/core/src/runtime.ts:37` — run it lazily before first statusline render.
- Add a small index-file cache to `plugins/journal/main.js` so `listNoteDates` doesn't re-walk the vault on every render.

## Not reviewed

- Actual runtime measurements (no profiling harness run — sizes are static, behavior is inferred from source).
- Test suite wall-clock time (did not execute `pnpm test` or `pnpm build` this session; dist/ was already present and inspected statically).
- CSS payload breakdown inside `console.css` (41kB — could contain unused selectors but not analyzed).
- Tauri IPC serialization cost for large vault reads — `vault_read` returns `String`, so very large files cross the bridge as a single UTF-8 copy with no streaming.
- Playwright / integration test performance.
- Memory footprint of long-running sessions (no leak audit).
