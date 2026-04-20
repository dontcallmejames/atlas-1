# Code Quality Review — Atlas 1

## Summary
Atlas 1 is in good shape for an M4-era codebase: the workspace split is sensible, strict TypeScript is honored in `packages/` and `apps/`, the plugin authoring contract is small and well-documented, and the test suite covers real behavior (file contents, state transitions, disposer fns) rather than internals. The main drags are (1) a leaky SDK surface where `settings`, `theme`, and `registerStatuslineSegment` are shipped as stubs with no core implementation, (2) duplicated boot logic in `apps/console/src/main.ts`, (3) duplicated "plugin loading" paths (`PluginLoader` vs `loadBuiltInPlugins`) with divergent data types over the same `.atlas/plugins.json` file, and (4) several dead or half-wired features (`Command.keybind`, `XpState.streak`, `packages/ui`). None are blockers; together they are the highest-leverage cleanup targets before M5.

## Strengths
- `packages/sdk` is tiny, pure-type, and the public surface is declared before any consumer — a good authoring contract.
- Strict TS and ESM-with-`.js`-specifier discipline is consistent across TS packages; no `any`, no non-null assertions in `packages/` and `apps/` (only two justifiable `as unknown as` casts in `cmdbar.ts` and the Tauri sniff in `main.ts`).
- Event bus swallows listener exceptions with a logged warning (`event-bus.ts:24`) so one misbehaving subscriber can't block others.
- `NodeVaultFs` and `scopeVaultFs` both perform path-escape checks; scoped vault is even dependency-free for webview bundling.
- Plugin loader isolates Node-only imports behind `await import()` so `@atlas/core` stays webview-safe (`plugin-loader.ts:73-74`). Good foresight.
- Tests exercise end-to-end behavior through the real command registry/vault pair (`plugins/*/main.test.js`), not mocks. `xp.flush()` is exposed specifically to make the async append testable — the API was shaped for testability.
- `mount-registry` is a clean observable: registry emits snapshots, shell subscribes, disposers remove entries. Clean separation of data and view.
- Ritual system (parser + registry + runner) is nicely factored into three focused files.

## Findings

### [HIGH] SDK advertises APIs that the core silently no-ops
- **Location:** `packages/sdk/src/plugin.ts:10-20`, `packages/core/src/plugins/context-factory.ts:79-90`
- **Issue:** `UiApi.registerStatuslineSegment`, `SettingsApi.register`, `ThemeApi.registerPack`, and `ThemeApi.currentTokens` are all present in the SDK contract but the core implementation returns a no-op disposer / empty tokens. A plugin author writing against the SDK has no way to know these are stubs; the test at `context-factory.test.ts:100` even asserts the stub behavior as if it were correct.
- **Impact:** Leaky abstraction, silent data loss, and confusion for third-party plugin authors who will assume their statusline segment or theme pack is wired.
- **Recommendation:** Either implement these (the statusline already knows about segments visually, so `registerStatuslineSegment` is the cheap win), or mark them as `@experimental` / remove them from the SDK surface until M5/M6. A `TODO(m5): not wired` JSDoc on each stub is the minimum.

### [HIGH] Boot sequence is duplicated in `main.ts`
- **Location:** `apps/console/src/main.ts:50-70` vs `apps/console/src/main.ts:73-102`
- **Issue:** The "first-run with onboarding" path and the "normal boot" path each construct the runtime, load built-ins, init the shell, start the cron tick, emit `app:ready`, init global shortcut, and stash the vault path. The two blocks will drift.
- **Impact:** Any new boot step must be remembered in two places; one of the recent-ish additions (`localStorage.setItem("atlas1c-vault", …)`) already differs subtly between branches (cached from `tempConfig.get().vaultPath` vs `vaultRoot`).
- **Recommendation:** Extract a single `async function startRuntime(vault, vaultRoot): Promise<Runtime>` that does the common work, and call it from both branches. The onboarding path just awaits the vault path first.

### [HIGH] Two representations of `.atlas/plugins.json`
- **Location:** `packages/core/src/plugins/plugin-loader.ts:5-15` (`PluginsJson`/`PluginsJsonEntry`) vs `packages/core/src/plugins/plugin-state.ts:5-14` (`PluginState`/`PluginStateEntry`)
- **Issue:** Both types describe the same on-disk file with slightly different field shapes (`path` required vs optional) and are serialized/read independently. `PluginLoader.readManifest` uses a raw `JSON.parse as PluginsJson` with no validation, while `loadPluginState` has proper defensive parsing. The settings UI and `loadBuiltInPlugins` use the latter; `PluginLoader` (for third-party plugins) uses the former. Writing via one and reading via the other is a foot-gun.
- **Impact:** Duplication and divergent robustness. Future plugin install flow will hit this seam.
- **Recommendation:** Delete `PluginsJson`/`PluginsJsonEntry`, have `PluginLoader` use `loadPluginState` directly, and put the defensive parsing in one place.

### [HIGH] Built-in plugin loading bypasses `PluginLoader` and forks its logic
- **Location:** `apps/console/src/boot/built-in-plugins.ts:23-54`
- **Issue:** `loadBuiltInPlugins` instantiates classes, calls `createContext`, invokes `onload`, and tracks disposers — essentially re-implementing `PluginLoader.loadOne`. It also returns a disposer that `main.ts` never captures, so `onunload` for built-ins is never called. Permission strings and the `atlas` version constraint in every `manifest.json` are ignored entirely.
- **Impact:** Drift between built-in and third-party plugin lifecycle, no graceful shutdown for built-ins, and the manifests are aspirational — they type-check nothing.
- **Recommendation:** Extend `PluginLoader` with an `addStaticPlugin({ id, pluginClass })` entry point (or pass the Vite-globbed modules into it) so there is a single code path. Capture the disposer in `main.ts` and call it on `beforeunload`. Separately, either enforce manifest `permissions`/`atlas` or strip them until enforcement lands.

### [MEDIUM] `XpState.streak` is typed, rendered, and never computed
- **Location:** `packages/sdk/src/xp.ts:19-21`, `packages/core/src/xp/xp-store.ts` (never writes it), `apps/console/src/shell/statusline.ts:38`
- **Issue:** The statusline shows `${state.streak}d 🔥` but `streak` is always 0 because the store's `apply()` never touches it. Habits plugin computes its own per-habit streak in `plugins/habits/parser.js:streakFor`, but nothing populates the global streak.
- **Impact:** Users see "0d 🔥" forever. Looks like a bug, not a stub.
- **Recommendation:** Either compute streak from the xp log in `XpStore.apply` (consecutive local-calendar-days with any xp event), or hide the segment until wired.

### [MEDIUM] `xpToLevel` doc claims triangular, implementation is linear
- **Location:** `packages/core/src/xp/level-curve.ts:1-9`
- **Issue:** The JSDoc says "Triangular curve: lvl N requires N * base total XP to reach" — that's linear, not triangular (triangular is N*(N+1)/2*base). The example is consistent with the linear formula, so the code is fine; only the word is wrong. This matters because `statusline.ts:25-27` computes `xpInLevel = xp - lvl * base` and `xpNext = base`, which only works for the linear curve.
- **Impact:** If someone reads the JSDoc and "fixes" the formula to be actually triangular, the statusline math breaks silently.
- **Recommendation:** Remove the word "triangular". Something like "Flat per-level curve: each level costs `base` XP."

### [MEDIUM] `Command.keybind` is a ghost field
- **Location:** `packages/sdk/src/commands.ts:17-19`, rendered at `apps/console/src/settings/keybindings.ts:44`
- **Issue:** The SDK types `keybind?: string` and the settings table shows it, but no code anywhere listens to the keyboard and dispatches by keybind. The only keyboard routing is the hard-coded `/` shortcut in `cmdbar.ts` and the global Tauri shortcut in `boot/global-shortcut.ts`.
- **Impact:** Plugins can set `keybind` and it will appear in the UI but never fire. User expectations will be violated.
- **Recommendation:** Add a small keybind dispatcher in `shell/cmdbar.ts` (or a new `shell/keybinds.ts`) that reads `runtime.commands.list()` on every change, parses each `keybind`, and attaches a `keydown` listener. Or drop the field until implemented.

### [MEDIUM] `packages/ui` is an empty placeholder
- **Location:** `packages/ui/src/index.ts:1-3` (just `export {};`)
- **Issue:** The package exists in the workspace with a TS config and a package.json but exports nothing. No consumer imports from it (verified — no `@atlas/ui` references in source outside its own tsconfig).
- **Impact:** Onboarding confusion and pnpm overhead for no benefit. New contributors will wonder whether UI components should live here or inline in `apps/console`.
- **Recommendation:** Either (a) move the shell's DOM-creation helpers (repeated `document.createElement` blocks in settings/plugins/ renderers) here, or (b) delete the package until there's something to put in it. A one-line comment "reserved for M6 Lit components" is the minimum.

### [MEDIUM] Raw DOM-string HTML in settings renderers
- **Location:** `apps/console/src/settings/*.ts` — every renderer does `header.innerHTML = '<div class="set-sec-title">…</div>…'`, and `tweaks.ts:35` does `brand.textContent = c.name.toUpperCase().replace(/\s+/g, "\u00B7")` after other spots manipulate the same element.
- **Issue:** Mixing `innerHTML` string-building with `createElement` in the same file, and no sanitization on user-controlled text (the name input flows into `brandMark` via the tweaks panel). In this case `textContent` is used, which is safe — but the pattern is inconsistent and the door is open.
- **Impact:** Readability; future regressions that flip one of these to `innerHTML` with a user string will be XSS.
- **Recommendation:** Adopt one pattern per file (prefer `createElement`/`textContent`) or add a tiny `h(tag, props, ...children)` helper. Worth revisiting when `packages/ui` gets populated.

### [MEDIUM] `statusline.ts` locates DOM by label text
- **Location:** `apps/console/src/shell/statusline.ts:51-58`, `findSegment` scans `.seg` nodes by looking for a `.k` child whose `textContent` equals "LVL" / "HP" / "NRG" / "FOCUS" / "STREAK".
- **Issue:** A brittle coupling to rendered text. If the prototype ever changes "HP" to "health" or localizes, the statusline silently stops updating. The lookup is also O(segments × labels) on every XP change.
- **Impact:** Maintainability + fragility.
- **Recommendation:** Give each segment a `data-stat="hp"` attribute in the HTML and query by that. One-time change.

### [MEDIUM] `tasks.done` / `tasks.undone` match by text identity ignores duplicates
- **Location:** `plugins/tasks/main.js:53-55, 73-75`
- **Issue:** `findIndex` hits the first match — if the user has two "buy milk" tasks, `/tasks.done buy milk` marks one non-deterministically and provides no feedback. Same in `tasks.undone`.
- **Impact:** Silent partial action, no indication of ambiguity.
- **Recommendation:** Either fail loudly when the query matches >1 non-completed task, or prefer id-form and drop text-match from the public contract. At minimum log a warning.

### [LOW] `xp-store.ts` overloads `delta` for vitals
- **Location:** `packages/core/src/xp/xp-store.ts:81-85`
- **Issue:** For `hp`/`nrg`/`focus`, `apply()` treats `event.delta` as absolute if it's 0–100 and relative otherwise. That's surprising — award(100, hp) sets to 100 but award(101, hp) adds 101 clamped to 100. No caller currently uses the relative form, so the cleverness is paying for nothing.
- **Impact:** Cognitive load, subtle footgun.
- **Recommendation:** Split into `set(kind, value)` and `adjust(kind, delta)` on the API, or pick one semantic.

### [LOW] `todayDate()` defined in three places
- **Location:** `plugins/habits/parser.js:126-132`, `plugins/journal/parser.js:55-57` (via `formatDate`), plus inlined again in `plugins/tasks/main.js:107` (archive stamp, month-only) and `plugins/habits/main.js:67-72` (inside `last30Dates`).
- **Issue:** Minor duplication of local-timezone YMD formatting.
- **Impact:** Low — but plugins are in JS with no shared util module, so it's worth noting.
- **Recommendation:** If a `@atlas/sdk/date` util is within scope for the SDK, add it; otherwise accept the duplication.

### [LOW] Cron matcher is single-value only
- **Location:** `packages/core/src/cron/cron-matcher.ts:11-16`
- **Issue:** Only `*` or a bare integer per field — no ranges (`0-10`), lists (`1,3,5`), or steps (`*/5`). `parseCron` silently returns null on malformed input which then disables cron for that ritual. `registry.ts:44` passes null through without logging.
- **Impact:** Surprising failure mode; `parseCron("*/5 * * * *")` → `null` → ritual's `@cron` directive silently does nothing.
- **Recommendation:** Either implement the standard subset, or log a warning when `parseCron` returns null during `RitualRegistry.load`.

### [LOW] Silent failures in ritual loader and plugin state
- **Location:** `packages/core/src/plugins/plugin-state.ts:21-25` (malformed → empty), `packages/core/src/rituals/registry.ts` (no log on null cron), `packages/core/src/xp/xp-store.ts:39-41` ("skip malformed line").
- **Issue:** All three swallow errors without logging, so a corrupt `.atlas/*.json|log|atlas` file manifests as "nothing happens" instead of a diagnostic.
- **Impact:** Debugging gets harder as the surface grows.
- **Recommendation:** Add `console.warn` with the file path and the underlying error. Error handling is otherwise consistent and good — this is the one category where it leans too quiet.

### [LOW] `MountRegistry.getView` is O(n) scan
- **Location:** `packages/core/src/plugins/mount-registry.ts:56-59`
- **Issue:** `getView(screenId)` iterates all views; since the map key is `pluginId:screenId` it can't do a direct lookup. Called on every screen activation via the MutationObserver.
- **Impact:** Negligible at current scale, but wrong for the pattern.
- **Recommendation:** Keep a parallel `Map<screenId, ScreenView>` or make `screenId` globally unique.

## Nits
- `apps/console/src/shell/core-commands.ts:4-30` — all commands registered via one long block, most with single-line bodies. Consider an array-of-definitions at module scope so the registration loop is three lines.
- `apps/console/src/shell/cmdbar.ts:42,45` — two `as unknown as (e: Event) => void` casts on the same handler; the signature can be `(e: Event) => void | Promise<void>` and type-narrow inside.
- `apps/console/src/main.ts:3` hard-codes `VERSION = "0.1.0"` while `plugins/*/manifest.json` also hard-codes `"0.1.0"` and `apps/console/package.json` presumably also has one. A single source of truth would help at release time.
- `plugins/tasks/main.js:121-124` has a dangling comment about commands auto-unregistering that doesn't hold (disposers are not captured). Either capture them or delete the comment.
- `plugins/tasks/parser.js:50-55` — using `Math.random()` for task IDs is fine here but an explicit `crypto.randomUUID()` fallback would be a two-liner and remove the "good enough for single-user" caveat.
- `plugins/journal/main.js:169-180` — inline debounce reinvented per plugin; `settings/identity.ts` has the same pattern. Candidate for a shared util.
- `plugins/journal/main.js:111` — `(current || header) + line` is confusing if `current` is empty string (falsy) but also if it's legitimately `"# …"` without a trailing newline; test coverage doesn't exercise that seam.
- `packages/core/src/plugins/context-factory.test.ts:100-115` — this test asserts that stubs return disposer fns; replace with a `todo`/`skip` so the stub status is visible in test output.
- `apps/console/src/boot/built-in-plugins.ts:8` — `import.meta.glob` path traversal (`../../../../plugins/*/main.js`) is fragile to directory reorg. A Vite alias would be clearer.
- `NodeVaultFs.remove` uses `rm({ force: true })` without `recursive`, so removing a directory silently fails. The `VaultFs` contract doesn't say which is correct.

## Not reviewed
- `src-tauri/` Rust code — out of scope for TS/JS review.
- `packages/ui/` — empty, nothing to review.
- `tests/` end-to-end and `playwright.config.ts` — not read; assumed covered by the UI/UX reviewer.
- `design/` and `docs/superpowers/` — not part of runtime code.
- Bundling / Vite config details beyond the one `import.meta.glob` call.
- Performance characteristics (reviewed in a parallel report).
- Security posture (reviewed in a parallel report; `docs/reviews/security.md` exists).
