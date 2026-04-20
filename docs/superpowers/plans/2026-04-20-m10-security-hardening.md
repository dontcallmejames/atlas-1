# M10 — Security Hardening (Tier 2 Group A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three security HIGH findings from the 2026-04-20 review so the app's defensive posture matches its "local-first, forkable" pitch before the repo gets promoted publicly.

**Architecture:** Two small, independent code fixes (Rust path canonicalization, Tauri CSP) plus one docs addition (plugin trust model). Each ships as a single focused task. The trust model doc matters because it sets honest expectations — the "scoped vault" is not a security boundary, and forkers writing plugins should know this before they audit.

**Tech Stack:** Rust (`src-tauri/src/vault.rs`), Tauri config (`tauri.conf.json`), markdown (`CONTRIBUTING.md`).

---

## File Structure

**Modify:**
- `src-tauri/src/vault.rs` — replace lexical `resolve_inside` with a canonicalize + symlink-reject implementation.
- `src-tauri/tauri.conf.json:24-26` — set `app.security.csp` to a strict policy.
- `CONTRIBUTING.md` — add a "Plugin trust model" section between the "Writing a plugin" and "Tests" sections.
- `docs/TECH-DEBT.md` — flip rows #6, #7, #8 from 🔴 to 🟢.

**Create:**
- *(none — all changes are edits)*

**Out of scope (explicitly parked):**
- Real plugin sandbox (Web Workers / iframe) — v2+.
- `set_vault_root` one-shot restriction — v2+, gets folded in when the sandbox lands.
- Self-hosting Google Fonts — Tier 3 polish; the CSP in this plan allows `fonts.googleapis.com` and `fonts.gstatic.com` until fonts are bundled locally.
- `scriptSrc 'unsafe-inline'` — we have zero inline scripts, so CSP stays strict on scripts. Inline styles are pervasive (`el.style.*` in plugins and settings renderers), so `style-src 'unsafe-inline'` is required until a follow-up nonce pass.

---

## Task 1: Canonicalize vault paths + reject symlinks

**Why:** `resolve_inside` currently does a lexical check (rejecting `..` components) without canonicalizing. A symlink or Windows junction inside the vault can point outside, and `fs::read_to_string`/`fs::write` will follow it. Combined with the no-sandbox plugin model, a malicious plugin can exfiltrate arbitrary user-readable files.

**Files:**
- Modify: `src-tauri/src/vault.rs` — rewrite `resolve_inside` (currently ~20 lines)
- Test: `src-tauri/src/vault.rs` bottom — add `#[cfg(test)] mod tests` with 4-6 cases

- [ ] **Step 1: Read the current `resolve_inside` and surrounding commands**

Run: `grep -n "resolve_inside\|fn.*vault_" src-tauri/src/vault.rs`

Expected: 8 IPC commands (`vault_read`, `vault_write`, `vault_append`, `vault_remove`, `vault_list`, `vault_exists`, `set_vault_root`, `get_vault_root`) — each call `resolve_inside` to bound the path. Read the full function and the three or four callers to understand the surface.

- [ ] **Step 2: Write failing tests first**

Add to the bottom of `src-tauri/src/vault.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rejects_parent_traversal() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        assert!(resolve_inside(root, "../escape.txt").is_err());
        assert!(resolve_inside(root, "foo/../../escape.txt").is_err());
    }

    #[test]
    fn rejects_absolute_path() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        #[cfg(windows)]
        let abs = "C:\\windows\\system32";
        #[cfg(not(windows))]
        let abs = "/etc/passwd";
        assert!(resolve_inside(root, abs).is_err());
    }

    #[test]
    fn accepts_normal_relative_path() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        // The file need not exist yet — this simulates a write to a new path.
        let resolved = resolve_inside(root, "notes/today.md").unwrap();
        assert!(resolved.starts_with(root));
        assert!(resolved.ends_with("today.md"));
    }

    #[test]
    #[cfg(not(windows))] // Windows symlink creation needs elevation in CI
    fn rejects_symlink_escape() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let outside = dir.path().parent().unwrap().join("outside.txt");
        fs::write(&outside, b"secret").unwrap();
        let link = root.join("escape");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        assert!(resolve_inside(root, "escape").is_err());
    }

    #[test]
    fn rejects_backslash_and_drive_prefix_on_relative_input() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        // These should all fail the validation before touching the filesystem.
        assert!(resolve_inside(root, "\\windows").is_err());
        assert!(resolve_inside(root, "C:foo").is_err());
    }
}
```

Add `tempfile` to `src-tauri/Cargo.toml` under `[dev-dependencies]` if not already present:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo test`

Expected: `rejects_symlink_escape` fails (current impl follows the symlink), and `rejects_backslash_and_drive_prefix_on_relative_input` may fail depending on current path parsing. `rejects_parent_traversal` and `rejects_absolute_path` should pass (existing checks).

- [ ] **Step 4: Implement the hardened `resolve_inside`**

Replace the existing `resolve_inside` function with:

```rust
/// Resolve `rel` against `root`, guaranteeing the result stays inside `root`
/// on the real filesystem (not just lexically).
///
/// Rules:
/// 1. `rel` must not be absolute, must not start with `/` or `\`, must not
///    contain a `:` (Windows drive-prefix) or any `ParentDir` component.
/// 2. The parent of the joined path is canonicalized (resolving symlinks).
///    If canonicalization fails because the parent doesn't exist yet, we
///    walk upward to the first existing ancestor and canonicalize that.
/// 3. The final canonical parent must have the canonical `root` as a prefix.
/// 4. If the joined path already exists and is itself a symlink, we reject it
///    — plugins should not be tricked into following a link out of the vault.
fn resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    // --- 1. Lexical validation (cheap, fails early) ---
    if rel.is_empty() {
        return Err("vault path must not be empty".into());
    }
    if rel.starts_with('/') || rel.starts_with('\\') {
        return Err(format!("vault path must be relative: {rel}"));
    }
    if rel.contains(':') {
        return Err(format!("vault path must not contain ':' : {rel}"));
    }
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(format!("vault path must be relative: {rel}"));
    }
    for comp in rel_path.components() {
        use std::path::Component;
        match comp {
            Component::ParentDir => return Err(format!("vault path must not contain '..': {rel}")),
            Component::Prefix(_) | Component::RootDir => {
                return Err(format!("vault path must be relative: {rel}"));
            }
            _ => {}
        }
    }

    // --- 2. Join and canonicalize ---
    let candidate = root.join(rel_path);

    // Reject if the candidate itself is a symlink.
    if let Ok(md) = std::fs::symlink_metadata(&candidate) {
        if md.file_type().is_symlink() {
            return Err(format!("vault path must not be a symlink: {rel}"));
        }
    }

    let canonical_root = std::fs::canonicalize(root)
        .map_err(|e| format!("failed to canonicalize vault root: {e}"))?;

    // Walk upward until we find an existing ancestor we can canonicalize. This
    // supports writes to paths whose parent directory doesn't exist yet.
    let mut cursor: &Path = candidate.as_path();
    let canonical_parent = loop {
        match cursor.parent() {
            Some(parent) => {
                if let Ok(c) = std::fs::canonicalize(parent) {
                    break c;
                }
                cursor = parent;
            }
            None => return Err(format!("vault path has no parent: {rel}")),
        }
    };

    // --- 3. Enforce prefix ---
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(format!("vault path escapes root: {rel}"));
    }

    Ok(candidate)
}
```

The function signature stays the same so all callers keep working.

- [ ] **Step 5: Run tests — verify they pass**

Run: `cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo test`

Expected: all 5 tests pass. If `rejects_symlink_escape` still fails, check that `symlink_metadata` is being called on the candidate path rather than following it.

- [ ] **Step 6: Run the full JS test suite to confirm nothing broke**

Run: `pnpm typecheck && pnpm test`

Expected: 178 tests pass, typecheck clean. The JS layer doesn't know about the Rust changes but exercises the IPC surface indirectly via `tauri-vault-fs.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/vault.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "fix(sec): canonicalize vault paths + reject symlinks to close escape"
```

---

## Task 2: Strict CSP in `tauri.conf.json`

**Why:** `app.security.csp` is currently `null`. Any HTML-injection bug anywhere in the app (a future markdown renderer, a plugin mishandling vault content, a dev-mode script injection) escalates instantly to full IPC compromise because the webview can load arbitrary remote scripts and call `window.__TAURI_INTERNALS__.invoke` against any whitelisted command.

**Files:**
- Modify: `src-tauri/tauri.conf.json:24-26`

- [ ] **Step 1: Read the current CSP config**

Run: `grep -A 3 'security' src-tauri/tauri.conf.json`

Expected: `"security": { "csp": null }`.

- [ ] **Step 2: Apply the CSP**

Replace `"csp": null` with the policy below. Comments are not valid JSON — each directive is explained here but the file gets the compact version.

**Policy breakdown:**
- `default-src 'self'` — deny everything unless explicitly allowed.
- `script-src 'self'` — only bundled scripts. No inline scripts (we use zero), no CDNs.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — inline styles are pervasive in the prototype (`el.style.*` in every plugin + settings renderer), so unsafe-inline stays until we do a nonce pass. Google Fonts loads CSS from `fonts.googleapis.com`.
- `font-src 'self' https://fonts.gstatic.com data:` — Google Fonts serves woff2 from `fonts.gstatic.com`. `data:` allows inlined icon fonts if ever added.
- `img-src 'self' data: blob:` — vault images (future) + inline data URIs.
- `connect-src 'self' ipc: https://ipc.localhost` — only Tauri IPC channels. No fetch to random URLs.
- `object-src 'none'` — no `<object>`/`<embed>` plugins.
- `base-uri 'self'` — prevent `<base>` injection hijacking relative URLs.
- `frame-ancestors 'none'` — can't be embedded in another frame (not that it matters for a desktop app, but no reason to allow).

```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' ipc: https://ipc.localhost; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
}
```

- [ ] **Step 3: Verify Tauri rebuilds without config errors**

Run: `cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo check`

Expected: clean. `tauri.conf.json` is validated at compile time.

- [ ] **Step 4: Launch the app and verify no CSP violations**

Run: `PATH="/c/Users/jford/.cargo/bin:$PATH" pnpm tauri:dev`

Open DevTools in the Atlas window (F12 or right-click → Inspect). Navigate through: home, tasks, journal, habits, settings, tweaks panel. Watch the Console tab for `Refused to load ... because it violates the Content Security Policy` errors.

**Expected:** no violations. If any appear, the most likely causes are:
- A new font CDN we didn't account for → add to `font-src`.
- An inline `<script>` somewhere → move it into a module file (scripts must be `'self'`).
- An iframe embed → reject it entirely (no iframes in scope for v1).

Log any violations you see; they're genuine bugs to fix, not CSP to loosen. Only loosen CSP if the resource is known-good (e.g., a new font host).

- [ ] **Step 5: Verify all three built-in plugins still work**

In the running app: `/tasks.add test`, then `/tasks.done 1`. `/journal.today` and type a character. `/habits.log <habit>` (use whatever habit is seeded). Confirm no CSP errors.

- [ ] **Step 6: Stop dev server, commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "fix(sec): set strict CSP on the webview"
```

---

## Task 3: Document plugin trust model in `CONTRIBUTING.md`

**Why:** The `scopeVaultFs` wrapper gives plugins the appearance of scoped FS access, but plugins run in the main webview realm and can bypass the wrapper by calling `invoke()` directly or by reading `window.__TAURI_INTERNALS__`. A plugin author (or auditor) who doesn't know this will mistake the wrapper for a security boundary and make bad design decisions downstream.

**Files:**
- Modify: `CONTRIBUTING.md` — add a new section

- [ ] **Step 1: Read the current `CONTRIBUTING.md` to find the best insertion point**

Run: `grep -n '^##' CONTRIBUTING.md`

Expected: headings like `## Dev setup`, `## Repo layout`, `## Writing a plugin`, `## Tests`, `## Commit style`, `## Before opening a PR`, `## Questions`.

- [ ] **Step 2: Insert a new section between "Writing a plugin" and "Tests"**

Add the section below. It's written for a plugin author — matter-of-fact, no alarmism, but the boundaries are explicit.

```markdown
## Plugin trust model

Atlas 1 loads built-in plugins into the same webview as the console shell. Plugins therefore have the full privileges of the console: they can read and write to the DOM, call `fetch`, call every exposed Tauri IPC command, and they share memory with other plugins.

The `ctx.vault` wrapper that each plugin receives is **defence-in-depth, not a sandbox**. It scopes ordinary vault calls to `plugins/<your-id>/`, but a hostile plugin can bypass it by importing `@tauri-apps/api/core` and calling `invoke("vault_read", { path: "..." })` directly. Treat the wrapper as a coordination tool (it keeps plugins from clobbering each other by accident), not as a security control.

Atlas 1 is designed for forks where the author controls the full plugin set. Do not install a plugin you have not read. If you ship Atlas publicly, ship it as a template that users fork and customise — do not build a plugin marketplace on top of v1.

**What a plugin can do:**
- Read and write files anywhere in the vault via the IPC surface (bypassing `scopeVaultFs`).
- Register arbitrary commands in the command registry.
- Subscribe to every event on the bus.
- Register global keyboard listeners on `window`.
- Issue `fetch` calls to any network destination not blocked by CSP.

**What CSP currently blocks:**
- Loading scripts from domains other than `self` — a malicious plugin cannot inject a remote payload by adding a `<script src="...">`.
- Connecting to arbitrary origins via `fetch` — only `self` and the Tauri IPC channels. This means a malicious plugin cannot exfiltrate data over `fetch` to an attacker-controlled domain without first being able to execute arbitrary script, which CSP blocks.

**Planned hardening (v2+):**
- Move plugins into Web Workers or an `<iframe srcdoc>` sandbox with a `postMessage`-only bridge.
- Enforce `permissions` from `manifest.json` at the Rust IPC layer, not just in JS.
- Restrict `set_vault_root` to onboarding so a plugin can't repoint the vault at runtime.

If any of these ship earlier than v2, the above list should be trimmed accordingly.
```

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs(sec): document plugin trust model and CSP posture"
```

---

## Task 4: Flip tech-debt rows + final verification

**Files:**
- Modify: `docs/TECH-DEBT.md` — rows #6, #7, #8 from 🔴 to 🟢

- [ ] **Step 1: Update the Tier 2 table**

In `docs/TECH-DEBT.md`, flip the status cell for rows 6, 7, and 8 to 🟢.

- [ ] **Step 2: Run the full verification gate**

Run: `pnpm typecheck && pnpm test && (cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo test)`

Expected: typecheck clean; 178+ JS tests pass; Rust tests pass (at least 5 new ones in `vault.rs`).

- [ ] **Step 3: Commit**

```bash
git add docs/TECH-DEBT.md
git commit -m "docs: mark Tier 2 Group A (security hardening) complete"
```

---

## Self-review notes

**Scope coverage:** Three Tier 2 HIGH rows (#6, #7, #8) → three implementation tasks + one hygiene task. No gaps.

**No placeholders:** every step has literal code or literal markdown content; every command has a concrete expected outcome. The only "adjust names to match reality" instruction is for the Rust function signature, because subagents have previously surfaced naming drift when I quoted verbatim.

**Type consistency:** `resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, String>` stays unchanged so all callers compile without edits.

**Manual step:** Task 2 Step 4 requires launching the app and watching DevTools — a subagent cannot do this cleanly, so this step must be performed by the human during final smoke. The task prompt for the implementer should make this explicit.
