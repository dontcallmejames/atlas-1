# Security Review — Atlas 1

## Summary

Atlas 1's threat model is a local, single-user desktop app, and posture is generally reasonable for that scope: the Tauri command surface is small (8 whitelisted commands), vault paths reject `..` and absolute paths in Rust, and plugin FS access is wrapped through a POSIX-normalizing scope guard. However, there are real weaknesses: CSP is disabled (`csp: null`), the vault-path check in Rust is purely lexical (no canonicalization — symlinks inside the vault can escape), plugins run in the main webview realm with unfettered access to `document`, `window`, `fetch`, and the raw `invoke()` binding, and several paths (Windows-drive absolute paths, backslash segments, `..` inside paths normalized before the check in JS) warrant tightening. Headline risks are (1) a malicious built-in plugin has the full power of the webview — there is no sandbox, (2) symlink-based vault escape on the Rust side, and (3) no CSP means an XSS bug anywhere in the chain immediately escalates to arbitrary IPC calls. Secrets hygiene is clean — no tokens or `.env` in the repo.

## Findings

### [HIGH] Plugin execution model provides no sandbox; any plugin fully compromises the app
- **Location:** `apps/console/src/boot/built-in-plugins.ts:8-54`, `packages/core/src/plugins/context-factory.ts:21-92`
- **Issue:** Plugins are loaded via `import.meta.glob("../../../../plugins/*/main.js", { eager: true })` and instantiated in the same JS realm as the console shell. They receive a `PluginContext` with scoped vault access, but nothing prevents them from reaching `window`, `document`, `fetch`, `@tauri-apps/api`'s raw `invoke()`, or from reading/writing the DOM of other plugins' views. The scoped vault wrapper (`scopeVaultFs`) only guards `ctx.vault.*` — a plugin can import `@tauri-apps/api/core` directly and call `invoke("vault_write", { path: "../../anything_inside_root", content })` to bypass its scope entirely.
- **Impact:** Any built-in plugin (and any future third-party plugin loaded this way) can read/write the entire vault, exfiltrate over `fetch`, register global key listeners, steal data from other plugins' views, or impersonate the user. The "scoped" FS is cosmetic from a security perspective.
- **Recommendation:** For built-ins this is acceptable as long as the codebase is trusted and documented as such. For a future plugin-marketplace story, move plugins into Web Workers or an `<iframe srcdoc>` sandbox with `postMessage`-only bridge, and enforce scoping in the Rust command layer (attach a plugin-id prefix on the IPC side, not just in JS). Document the current trust model explicitly in `docs/` so forkers don't mistake scoped-vault-fs for a security boundary.

### [HIGH] Vault path guard does not canonicalize — symlinks can escape the vault root
- **Location:** `src-tauri/src/vault.rs:13-30` (`resolve_inside`)
- **Issue:** `resolve_inside` rejects `..` components and absolute paths lexically, but never canonicalizes the result and never resolves symlinks. If the user's vault contains (or an attacker plants) a symlink/junction inside the vault pointing outside, `vault_read`/`vault_write`/`vault_remove` will happily follow it. On Windows, directory junctions and symlinks are both honored by `fs::read_to_string` / `fs::write`. The comment on line 27 ("`candidate` will start with `root` because `rel` is relative and has no `..`") is correct lexically but not filesystem-wise.
- **Impact:** A malicious plugin (or a crafted vault folder) can read arbitrary files the desktop user can read, or write/delete arbitrary files the user can write, by dropping a symlink into the vault. Combined with the HIGH above, this is a one-plugin-to-RCE-adjacent primitive on systems where symlink creation is permitted.
- **Recommendation:** After joining, call `std::fs::canonicalize` on both `root` and the parent of `candidate` (parent because the target file may not exist yet for writes) and assert the canonical candidate `starts_with` the canonical root. Alternatively use the `dunce` crate on Windows to avoid UNC-prefix surprises, and explicitly reject symlinks via `symlink_metadata` before opening.

### [HIGH] CSP is disabled (`csp: null`)
- **Location:** `src-tauri/tauri.conf.json:24-26`
- **Issue:** `app.security.csp` is `null`, so the webview has no Content Security Policy. Any XSS — from a future markdown renderer, a plugin that mishandles vault content, or a dev-mode script injection — can load arbitrary remote scripts, exfiltrate to attacker-controlled endpoints, and call `window.__TAURI_INTERNALS__.invoke` against every whitelisted command.
- **Impact:** Defence-in-depth is absent. A single HTML-injection bug anywhere in the app escalates directly to full vault read/write.
- **Recommendation:** Set a strict CSP, e.g. `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ipc: https://ipc.localhost; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"`. Inline styles are used throughout the plugins (`el.style.*`), so `style-src 'unsafe-inline'` or nonces are needed; inline scripts are not used and should stay disallowed. Test against all three built-in plugins.

### [MEDIUM] Rust path guard misses Windows-drive and UNC absolute paths and does not reject backslashes
- **Location:** `src-tauri/src/vault.rs:18-26`
- **Issue:** The check walks `Path::new(rel).components()` and rejects `ParentDir`, but on Windows `\\server\share\file` and `C:foo` are parsed as `Prefix` + components and `Path::is_absolute()` catches the first but not a `rel` like `C:foo` (drive-relative) consistently. More importantly, a caller passing `"..\\..\\etc"` still gets rejected (good — `ParentDir`), but a caller passing `"plugins/evil/../../../etc"` — the JS side already normalizes with posix rules so this mostly doesn't happen from plugins, but a malicious plugin bypassing `scopeVaultFs` and calling `invoke()` directly can pass any string. The Rust check is the last line of defence and should be stricter.
- **Impact:** Edge-case path strings may be accepted on Windows that, after the OS resolves them, land outside the vault. Lower severity than the symlink finding because exploitation requires a cooperating plugin plus OS-specific path parsing, but it's the same class of bug.
- **Recommendation:** Canonicalize (see HIGH above) — that finding's fix subsumes this one. Additionally, reject any `rel` containing `:`, a leading `/` or `\`, or any `Prefix`/`RootDir` component before joining.

### [MEDIUM] `scopeVaultFs` normalizes before checking, allowing boundary-case confusion
- **Location:** `packages/core/src/vault/scoped-vault-fs.ts:39-49`
- **Issue:** `resolveScoped` joins scope + path, then `posixNormalize`s the result and checks prefix. This is correct for `..` traversal, but:
  1. Backslashes are not treated as separators (`posixNormalize` only splits on `/`). A path like `..\\secret` passes the `..` loop untouched because `\\..\\` is never decomposed. On Windows, when this string eventually hits the Rust side as a `rel`, the OS will treat the backslash as a separator and `Path::components` will yield `ParentDir`, which the Rust guard does reject — so the JS wrapper is defence-in-depth only, and OK today. Worth documenting.
  2. A scope of `"plugins/foo"` and a path starting with `plugins/foo-evil/...` is correctly rejected (`startsWith(scope + "/")`), good.
  3. Empty or `.` input: `posixJoin("foo", ".")` → `"foo"` which equals scope and is allowed (fine for list/exists). Not a bug, just worth a test.
- **Impact:** On its own, low — the Rust layer catches actual escape. But the module claims to be the scope enforcement boundary and its behavior on Windows separators surprises.
- **Recommendation:** Reject `\\` outright in input (`throw new Error("backslash not allowed in vault path")`), and add tests for backslash / mixed-separator inputs.

### [MEDIUM] innerHTML sinks use only static strings today, but the pattern is fragile
- **Location:** `apps/console/src/settings/*.ts`, `plugins/{tasks,journal,habits}/main.js` (11 sites)
- **Issue:** Every `el.innerHTML = ...` assignment I inspected uses a literal string with no interpolation of vault content or user input. This is currently safe. However, nothing prevents a future edit from interpolating a plugin-supplied string, and there is no lint rule or sanitizer in place.
- **Impact:** A future commit that interpolates vault data into one of these sinks instantly becomes XSS, which with no CSP is full IPC compromise.
- **Recommendation:** Add an ESLint rule (`no-restricted-syntax` on `AssignmentExpression[left.property.name='innerHTML']`) or prefer `textContent` + DOM construction uniformly. At minimum, add a note in `CONTRIBUTING.md` near the plugin docs. Pair with the CSP fix above.

### [LOW] No allowlist for plugin ids; directory name becomes command namespace
- **Location:** `apps/console/src/boot/built-in-plugins.ts:68-72`, `packages/core/src/plugins/context-factory.ts:26`
- **Issue:** The plugin id is extracted from the directory name via regex. A plugin folder named `../evil` on disk wouldn't match the regex (`/\/plugins\/([^/]+)\/main\.js$/` forbids `/`, but `..` is fine), but an id of `..` or `.atlas` would become the scope prefix passed to `scopeVaultFs`. `scopeVaultFs` does guard against `scope` normalizing to `..` (line 35), so this is caught — but the defence-in-depth reliance is worth documenting.
- **Impact:** None today given the guard, but a regression in `scopeVaultFs` would expose this.
- **Recommendation:** Validate plugin ids against a strict regex (`/^[a-z][a-z0-9_-]{0,31}$/`) at load time in `built-in-plugins.ts` and refuse to load mismatches. Also ensures command namespacing stays well-formed.

### [LOW] Global shortcut string is passed through unvalidated
- **Location:** `apps/console/src/boot/global-shortcut.ts:11-45`
- **Issue:** The `shortcut` string is forwarded directly to `tauri-plugin-global-shortcut`'s `register()` / `unregister()`. There's no format validation in Atlas; parsing is delegated to the plugin. The capability allows `global-shortcut:allow-register` so any accepted string works. No injection vector exists because the API takes a parsed accelerator, not a shell string, and on failure the plugin throws.
- **Impact:** None beyond user-observable failures.
- **Recommendation:** Low priority — add a regex sanity check (`/^(Command|Ctrl|Shift|Alt|Super|\+|[A-Za-z0-9]+)+$/` roughly) before calling `register` to fail fast with a clearer error. Not a security fix, a UX fix.

### [LOW] Vault-root state is process-global with no re-validation
- **Location:** `src-tauri/src/vault.rs:10-49` (`VaultRoot`, `set_vault_root`)
- **Issue:** `set_vault_root` can be called from the webview at any time and replaces the global root with whatever path the caller supplies (after an `is_dir` check). There's no check that the caller is the onboarding flow specifically; any JS (including a malicious plugin) can call `invoke("set_vault_root", { path: "C:\\" })` and then operate on the user's entire C: drive through the vault commands.
- **Impact:** Combined with the plugin-sandbox finding, a malicious plugin can repoint the vault root to `/` and read/write anywhere the user can.
- **Recommendation:** After onboarding completes, either remove `set_vault_root` from the invoke handler list on subsequent boots, or guard it with a "not already set" check (`err if Some(_)` is present) and require the user to restart the app to change vaults. Better: move vault-root selection entirely to Rust (read from config file on startup) and expose only `get_vault_root`.

### [LOW] Plugin-disabled state is reachable by the plugin itself
- **Location:** `packages/core/src/plugins/*`, `.atlas/plugins.json` (read by `loadPluginState`)
- **Issue:** A plugin has full vault access and can modify `.atlas/plugins.json` to re-enable itself or disable others. Inherent to the no-sandbox model; called out for completeness.
- **Impact:** Low today (single-user, built-ins only). Relevant if a marketplace ships.
- **Recommendation:** When a plugin sandbox lands, move `.atlas/plugins.json` writes behind a dedicated IPC command not exposed to plugins.

### [LOW] Dependency posture — no known-bad pins, but Rust crates are on minimum patch
- **Location:** `src-tauri/Cargo.toml`, `apps/console/package.json`
- **Issue:** `tauri = "2.1"`, `tauri-plugin-dialog = "2.2"`, `tauri-plugin-global-shortcut = "2.2"`, `serde = "1.0"`, `serde_json = "1.0"` — all use loose caret ranges, which is fine, but no `Cargo.lock` is committed under `src-tauri/` was visible separately from build artifacts. On the JS side, `@tauri-apps/api ^2.1.1`, `lit ^3.2.0`, `vite ^5.4.0` — no obviously vulnerable pins.
- **Impact:** None identified without running `cargo audit` / `pnpm audit`.
- **Recommendation:** Run `cargo audit` and `pnpm audit` in CI. Commit `Cargo.lock` (it's in the repo — good). Pin the Tauri minor version once 2.x hits a long-term release.

## Not reviewed
- Ritual / cron runner (`packages/core/src/rituals/`, `packages/core/src/cron/`) — out of the 7 listed scope items; could host command-injection if rituals run shell commands, but a quick grep shows they call `commands.invoke`, not the OS shell, so unlikely.
- Test and e2e infrastructure (Playwright config, vitest config) — not user-facing.
- The `test vault/` directory at repo root — looks like fixture data; not inspected for secrets beyond filename grep.
- Packaged release signing (`bundle` section of `tauri.conf.json`) — no signing identity configured, but that's a distribution concern, not a runtime-security one.
- Windows-specific DLL-hijack / installer hardening — not in scope for source-level review.
- Runtime behavior under Tauri's dev server (`http://localhost:1420`) vs. production `tauri://` — dev mode has a broader origin and should not be shipped.
