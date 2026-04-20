# Atlas 1 — M3 Shell Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the M2 runtime to the existing Tauri webview. On boot, Atlas opens a user-chosen vault, loads enabled plugins, and drives the shell (nav, statusline, command bar, tweaks panel, theme, CRT) from the runtime's stores and registries instead of the prototype's inline scripts. First-run users complete an onboarding wizard that writes their instance config (name, theme, accent, vault path, enabled modules) to `.atlas/config.json`.

**Architecture:** A Rust IPC layer (`src-tauri`) exposes the vault filesystem and a folder-picker dialog to the webview. A new `TauriVaultFs` class in `apps/console/src/core/` wraps those IPC calls and implements the `VaultFs` interface from `@atlas/sdk`. `apps/console/src/main.ts` becomes the real entrypoint: it constructs a `Runtime` via `createRuntime()`, branches to either the onboarding wizard or the normal shell depending on `config.onboarded`, and hands the runtime to a collection of focused shell modules (`theme.ts`, `clock.ts`, `nav.ts`, `cmdbar.ts`, `statusline.ts`, `tweaks.ts`, `core-commands.ts`). Each shell module reads from or writes to the runtime stores, replacing a matching block of inline JS in `apps/console/index.html`.

**Tech Stack:** Tauri 2 (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`), Vitest for TS unit tests, the existing Playwright smoke. No new Rust plugins beyond `tauri-plugin-dialog`.

**Prerequisite reading:**
- Spec: `docs/superpowers/specs/2026-04-19-atlas-1-v1-design.md` — sections **Plugin System**, **REPL & Command System**, **Theming, Stats & Game Layer**, **Onboarding**.
- M1 + M2 plans in `docs/superpowers/plans/`. M2 built `@atlas/core` and `@atlas/sdk`; this plan consumes them.
- `apps/console/index.html` — specifically the inline `<script>` block at lines 1829–2095 and the existing DOM landmarks (`#brandMark`, `#screenNav`, `#statusline`, `#clockStr`, `#miniClock`, `#themeBtn`, `#crtBtn`, `#tweakBtn`, `#tweaksPanel`, `#scr-boot`, `#scr-home`, etc.).
- `apps/console/src/main.ts` — currently just logs the boot line.

**Windows note:** User runs Windows 11 + bash. Forward slashes work in bash paths. The `Write` tool can fail EEXIST — fall back to `cat > path << 'ENDOFFILE' ... ENDOFFILE` with a single-quoted delimiter when content contains `$` or backticks. Rust commands need `PATH="/c/Users/jford/.cargo/bin:$PATH"` prefixed in bash.

---

## File structure after M3

```
src-tauri/src/
├── main.rs                          # unchanged
├── lib.rs                           # wires plugins + commands
└── vault.rs                         # NEW — vault-root state + IPC commands

apps/console/src/
├── main.ts                          # REWRITTEN — real boot sequence
├── core/
│   ├── tauri-vault-fs.ts            # NEW — VaultFs over Tauri IPC
│   ├── tauri-vault-fs.test.ts       # NEW
│   └── pick-vault-folder.ts         # NEW — dialog helper
├── shell/
│   ├── theme.ts                     # NEW — config ↔ data-theme + CRT class
│   ├── clock.ts                     # NEW — drives #clockStr + #miniClock
│   ├── nav.ts                       # NEW — wires nav buttons to `go` command
│   ├── cmdbar.ts                    # NEW — / focus + parse + invoke
│   ├── statusline.ts                # NEW — xp → statusline segments
│   ├── tweaks.ts                    # NEW — tweaks panel ↔ config
│   └── core-commands.ts             # NEW — register built-in commands
├── onboarding/
│   └── boot.ts                      # NEW — 6-step wizard writing config
└── index.html                       # MODIFIED — delete replaced inline scripts
```

---

## Task 1: Rust vault IPC commands + global vault-root state

**Files:**
- Create: `src-tauri/src/vault.rs`
- Modify: `src-tauri/src/lib.rs` (wire the module + register commands)
- Modify: `src-tauri/capabilities/default.json` (allow the new commands)

### Steps

- [ ] **Step 1: Create `src-tauri/src/vault.rs`**

```rust
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::State;

/// Global, process-lifetime vault root. Set once by the webview after the user
/// picks a folder (or after onboarding writes it to config). None until set.
#[derive(Default)]
pub struct VaultRoot(pub Mutex<Option<PathBuf>>);

fn resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let candidate = root.join(rel);
    let canon_root = root.to_path_buf();
    // Normalize without requiring the file to exist yet.
    // Reject any `..` segments to prevent escape.
    for component in Path::new(rel).components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(format!("path escapes vault root: {}", rel));
        }
    }
    // Still guard against absolute paths.
    if Path::new(rel).is_absolute() {
        return Err(format!("path must be relative: {}", rel));
    }
    // `candidate` will start with `root` because `rel` is relative and has no `..`.
    let _ = canon_root;
    Ok(candidate)
}

fn require_root(state: &State<VaultRoot>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "vault root not set".into())
}

#[tauri::command]
pub fn set_vault_root(path: String, state: State<VaultRoot>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("vault path is not a directory: {}", path));
    }
    *state.0.lock().map_err(|e| e.to_string())? = Some(p);
    Ok(())
}

#[tauri::command]
pub fn get_vault_root(state: State<VaultRoot>) -> Option<String> {
    state
        .0
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn vault_read(path: String, state: State<VaultRoot>) -> Result<String, String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    fs::read_to_string(&abs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_write(path: String, content: String, state: State<VaultRoot>) -> Result<(), String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_append(path: String, content: String, state: State<VaultRoot>) -> Result<(), String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&abs)
        .map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_list(path: String, state: State<VaultRoot>) -> Result<Vec<String>, String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    let read = match fs::read_dir(&abs) {
        Ok(r) => r,
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let mut names = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

#[tauri::command]
pub fn vault_exists(path: String, state: State<VaultRoot>) -> Result<bool, String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    Ok(abs.exists())
}

#[tauri::command]
pub fn vault_remove(path: String, state: State<VaultRoot>) -> Result<(), String> {
    let root = require_root(&state)?;
    let abs = resolve_inside(&root, &path)?;
    match fs::remove_file(&abs) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
```

- [ ] **Step 2: Modify `src-tauri/src/lib.rs`** (current content is minimal; replace entirely with):

```rust
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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

- [ ] **Step 3: Modify `src-tauri/capabilities/default.json`** (replace contents):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for Atlas 1.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:webview:default"
  ]
}
```

Note: the custom vault commands (`set_vault_root`, `vault_read`, etc.) are not gated behind a permission scheme in Tauri 2 once they're registered via `invoke_handler` — they're available to the webview by default. We just need `core:default` to exist.

- [ ] **Step 4: Verify the Rust side compiles**

Run (note the PATH export — Cargo is not on the default bash PATH):
```bash
export PATH="/c/Users/jford/.cargo/bin:$PATH" && cd /c/Users/jford/OneDrive/Projects/Atlas-1/src-tauri && cargo check && cd ..
```
Expected: `Finished \`dev\` profile ...`. No errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && git add src-tauri/
git commit -m "feat(tauri): vault IPC commands and vault-root state"
```

---

## Task 2: Install tauri-plugin-dialog and wrap in TS helper

**Files:**
- Modify: `src-tauri/Cargo.toml` (add dep)
- Modify: `src-tauri/src/lib.rs` (register the plugin)
- Modify: `src-tauri/capabilities/default.json` (add dialog perms)
- Modify: `apps/console/package.json` (add `@tauri-apps/plugin-dialog`)
- Create: `apps/console/src/core/pick-vault-folder.ts`

### Steps

- [ ] **Step 1: Add the Rust dep to `src-tauri/Cargo.toml`**

Find the `[dependencies]` section and add the `tauri-plugin-dialog` line so the section ends up with:

```toml
[dependencies]
tauri = { version = "2.1", features = [] }
tauri-plugin-dialog = "2.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

- [ ] **Step 2: Register the plugin in `src-tauri/src/lib.rs`**

Insert the plugin registration line so the builder chain reads:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
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
```

- [ ] **Step 3: Add the dialog permission to `src-tauri/capabilities/default.json`**

Replace the `permissions` array so it reads:
```json
  "permissions": [
    "core:default",
    "core:window:default",
    "core:webview:default",
    "dialog:default"
  ]
```

- [ ] **Step 4: Add the JS package**

Edit `apps/console/package.json`'s `dependencies` block to include:
```json
  "dependencies": {
    "lit": "^3.2.0",
    "@tauri-apps/api": "^2.1.1",
    "@tauri-apps/plugin-dialog": "^2.2.0"
  }
```

Then run:
```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm install
```
Expected: both packages resolve.

- [ ] **Step 5: Create `apps/console/src/core/pick-vault-folder.ts`**

```ts
import { open } from "@tauri-apps/plugin-dialog";

export async function pickVaultFolder(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: true,
    title: "Pick your Atlas vault folder",
  });
  if (!result || Array.isArray(result)) return null;
  return result;
}
```

- [ ] **Step 6: Verify Rust still compiles**

```bash
export PATH="/c/Users/jford/.cargo/bin:$PATH" && cd /c/Users/jford/OneDrive/Projects/Atlas-1/src-tauri && cargo check && cd ..
```
Expected: success.

- [ ] **Step 7: Typecheck the webview**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm --filter @atlas/console typecheck
```
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json apps/console/package.json pnpm-lock.yaml apps/console/src/core/pick-vault-folder.ts
git commit -m "feat(tauri): add dialog plugin and pickVaultFolder helper"
```

---

## Task 3: `TauriVaultFs` TypeScript driver + tests

**Files:**
- Create: `apps/console/src/core/tauri-vault-fs.ts`
- Create: `apps/console/src/core/tauri-vault-fs.test.ts`
- Create: `apps/console/vitest.config.ts`
- Modify: `apps/console/package.json` (add vitest dev dep + test script)

### Steps

- [ ] **Step 1: Add vitest to `apps/console/package.json`**

Add to `devDependencies` and update `scripts`:
```json
{
  "name": "@atlas/console",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "lit": "^3.2.0",
    "@atlas/sdk": "workspace:*",
    "@atlas/core": "workspace:*",
    "@tauri-apps/api": "^2.1.1",
    "@tauri-apps/plugin-dialog": "^2.2.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

(`@atlas/sdk` and `@atlas/core` are added here too — needed by main.ts in Task 5.)

- [ ] **Step 2: Create `apps/console/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    reporters: "default",
  },
});
```

- [ ] **Step 3: Install**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm install
```

- [ ] **Step 4: Write failing tests** at `apps/console/src/core/tauri-vault-fs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri core invoke API. Must be set up before importing the SUT.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { TauriVaultFs } from "./tauri-vault-fs.js";

describe("TauriVaultFs", () => {
  let vault: TauriVaultFs;

  beforeEach(() => {
    invokeMock.mockReset();
    vault = new TauriVaultFs();
  });

  it("read invokes vault_read with the path", async () => {
    invokeMock.mockResolvedValueOnce("hello");
    expect(await vault.read("a.md")).toBe("hello");
    expect(invokeMock).toHaveBeenCalledWith("vault_read", { path: "a.md" });
  });

  it("write invokes vault_write with path + content", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.write("a/b.md", "hi");
    expect(invokeMock).toHaveBeenCalledWith("vault_write", { path: "a/b.md", content: "hi" });
  });

  it("append invokes vault_append with path + content", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.append("log.jsonl", "line\n");
    expect(invokeMock).toHaveBeenCalledWith("vault_append", { path: "log.jsonl", content: "line\n" });
  });

  it("list returns the array from vault_list", async () => {
    invokeMock.mockResolvedValueOnce(["a.md", "b.md"]);
    expect(await vault.list("tasks")).toEqual(["a.md", "b.md"]);
    expect(invokeMock).toHaveBeenCalledWith("vault_list", { path: "tasks" });
  });

  it("exists returns the boolean from vault_exists", async () => {
    invokeMock.mockResolvedValueOnce(true);
    expect(await vault.exists("a.md")).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("vault_exists", { path: "a.md" });
  });

  it("remove invokes vault_remove", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.remove("a.md");
    expect(invokeMock).toHaveBeenCalledWith("vault_remove", { path: "a.md" });
  });

  it("setVaultRoot invokes set_vault_root with absolute path", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.setVaultRoot("/home/user/atlas");
    expect(invokeMock).toHaveBeenCalledWith("set_vault_root", { path: "/home/user/atlas" });
  });

  it("getVaultRoot returns the string from get_vault_root", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/atlas");
    expect(await vault.getVaultRoot()).toBe("/home/user/atlas");
  });

  it("getVaultRoot returns null when unset", async () => {
    invokeMock.mockResolvedValueOnce(null);
    expect(await vault.getVaultRoot()).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests — verify they fail**

```bash
pnpm --filter @atlas/console test src/core/tauri-vault-fs.test.ts
```
Expected: module not found.

- [ ] **Step 6: Write `apps/console/src/core/tauri-vault-fs.ts`**

```ts
import type { VaultFs, VaultPath } from "@atlas/sdk";
import { invoke } from "@tauri-apps/api/core";

/**
 * VaultFs implementation backed by Tauri IPC commands defined in src-tauri/src/vault.rs.
 * The vault root is a process-level singleton set via `setVaultRoot`.
 */
export class TauriVaultFs implements VaultFs {
  read(path: VaultPath): Promise<string> {
    return invoke<string>("vault_read", { path });
  }

  write(path: VaultPath, content: string): Promise<void> {
    return invoke<void>("vault_write", { path, content });
  }

  append(path: VaultPath, content: string): Promise<void> {
    return invoke<void>("vault_append", { path, content });
  }

  list(path: VaultPath): Promise<string[]> {
    return invoke<string[]>("vault_list", { path });
  }

  exists(path: VaultPath): Promise<boolean> {
    return invoke<boolean>("vault_exists", { path });
  }

  remove(path: VaultPath): Promise<void> {
    return invoke<void>("vault_remove", { path });
  }

  setVaultRoot(path: string): Promise<void> {
    return invoke<void>("set_vault_root", { path });
  }

  getVaultRoot(): Promise<string | null> {
    return invoke<string | null>("get_vault_root");
  }
}
```

- [ ] **Step 7: Run tests — verify pass**

```bash
pnpm --filter @atlas/console test src/core/tauri-vault-fs.test.ts
```
Expected: 9 passed.

- [ ] **Step 8: Commit**

```bash
git add apps/console/src/core/ apps/console/vitest.config.ts apps/console/package.json pnpm-lock.yaml
git commit -m "feat(console): TauriVaultFs + pickVaultFolder helper"
```

---

## Task 4: Boot sequence — `main.ts` creates the runtime

This rewrites `apps/console/src/main.ts` so it:
1. Constructs a `TauriVaultFs`, a `ConfigStore`, and loads it.
2. If the user has no vault path saved yet (first run), runs the onboarding wizard (Task 12).
3. If onboarded, calls `TauriVaultFs.setVaultRoot(config.vaultPath)`, creates the full runtime via `createRuntime()`, loads plugins, hands the runtime to the shell modules.

For this task we put in just the scaffolding + the "happy path" that works when a vault is already configured. The onboarding branch is added in Task 12.

**Files:**
- Modify: `apps/console/src/main.ts` (replace entirely)
- Create: `apps/console/src/shell/index.ts` (barrel for shell init)

### Steps

- [ ] **Step 1: Create `apps/console/src/shell/index.ts`**

```ts
import type { Runtime } from "@atlas/core";

/** Called by main.ts once the runtime is ready and plugins have loaded. */
export async function initShell(_runtime: Runtime): Promise<void> {
  // Wiring added by Tasks 5–12. For now, the inline prototype scripts still
  // handle visual behavior; these modules incrementally take over each.
}
```

- [ ] **Step 2: Replace `apps/console/src/main.ts`** with:

```ts
// Atlas 1 — console bootstrap.

import { createRuntime, ConfigStore } from "@atlas/core";
import { TauriVaultFs } from "./core/tauri-vault-fs.js";
import { initShell } from "./shell/index.js";

const VERSION = "0.1.0";

async function boot(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Atlas 1 · v${VERSION} · booting`);

  const vault = new TauriVaultFs();

  // Detect whether a vault root has been set (process-level) already.
  let vaultRoot = await vault.getVaultRoot();

  if (!vaultRoot) {
    // First-run or not-yet-set. Read config from... where? We can't read config
    // until the vault root is set. This is a chicken-and-egg solved by Task 12
    // (onboarding). For now, show a minimal "pick vault" prompt via dialog.
    const { pickVaultFolder } = await import("./core/pick-vault-folder.js");
    const picked = await pickVaultFolder();
    if (!picked) {
      // eslint-disable-next-line no-console
      console.warn("no vault selected — boot aborted");
      return;
    }
    await vault.setVaultRoot(picked);
    vaultRoot = picked;
  }

  // Now that the vault root is set we can load config.
  const config = new ConfigStore(vault);
  await config.load();

  const runtime = await createRuntime({ vault, vaultRoot });
  await runtime.load();

  await initShell(runtime);

  // eslint-disable-next-line no-console
  console.log(`Atlas 1 · v${VERSION} · booted`);
}

window.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("atlas boot failed:", err);
  });
});
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @atlas/console typecheck
```
Expected: exit 0. If `@atlas/core` exports aren't resolving, check that `packages/core/package.json`'s `main` points at `./src/index.ts` — it does as of M2.

- [ ] **Step 4: Update the Playwright smoke test expectation**

The existing smoke test in `tests/smoke.spec.ts` asserts the bootstrap logs "Atlas 1 · v0.1.0 · booted". That log now only fires after a vault is selected. In the Playwright environment there's no Tauri, so `invoke` calls will reject, and the new boot will fail early. Two options:

**Option A (used here):** make main.ts tolerate the Tauri-absent case gracefully and still log the booted line.

Update `apps/console/src/main.ts` to detect a non-Tauri environment and short-circuit:

```ts
// ... near top, after imports
function isTauri(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";
}
```

And wrap the Tauri-using boot body:

```ts
async function boot(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Atlas 1 · v${VERSION} · booting`);

  if (!isTauri()) {
    // Browser-only preview mode (e.g. Playwright, `pnpm dev`). No runtime; the
    // prototype's inline scripts still drive the visuals.
    console.log(`Atlas 1 · v${VERSION} · booted`);
    return;
  }

  const vault = new TauriVaultFs();
  let vaultRoot = await vault.getVaultRoot();
  if (!vaultRoot) {
    const { pickVaultFolder } = await import("./core/pick-vault-folder.js");
    const picked = await pickVaultFolder();
    if (!picked) {
      console.warn("no vault selected — boot aborted");
      return;
    }
    await vault.setVaultRoot(picked);
    vaultRoot = picked;
  }

  const config = new ConfigStore(vault);
  await config.load();

  const runtime = await createRuntime({ vault, vaultRoot });
  await runtime.load();

  await initShell(runtime);

  console.log(`Atlas 1 · v${VERSION} · booted`);
}
```

- [ ] **Step 5: Re-run Playwright smoke to confirm no regression**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm test:e2e
```
Expected: 1 passed — the boot line still appears.

- [ ] **Step 6: Commit**

```bash
git add apps/console/src/main.ts apps/console/src/shell/index.ts
git commit -m "feat(console): boot sequence assembles runtime from Tauri vault"
```

---

## Task 5: Theme + CRT wiring (replaces inline scripts lines 1909–1951)

**Files:**
- Create: `apps/console/src/shell/theme.ts`
- Modify: `apps/console/src/shell/index.ts` (call `initTheme`)
- Modify: `apps/console/index.html` (remove inline theme/CRT handler block)

### Steps

- [ ] **Step 1: Create `apps/console/src/shell/theme.ts`**

```ts
import type { Runtime } from "@atlas/core";

/**
 * Apply the current config theme + CRT state to the DOM, and keep them
 * in sync when config changes. Also wires the `#themeBtn` and `#crtBtn`
 * toggles so user clicks update the config store.
 */
export function initTheme(runtime: Runtime): () => void {
  const apply = (): void => {
    const c = runtime.config.get();
    document.documentElement.setAttribute("data-theme", c.theme);
    document.body.classList.toggle("crt", c.crt);
    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.textContent = `theme: ${c.theme}`;
    const crtBtn = document.getElementById("crtBtn");
    if (crtBtn) crtBtn.classList.toggle("on", c.crt);
  };
  apply();

  const offConfig = runtime.config.subscribe(apply);

  const themeBtn = document.getElementById("themeBtn");
  const onTheme = (): void => {
    const next = runtime.config.get().theme === "light" ? "dark" : "light";
    runtime.config.update({ theme: next });
    void runtime.config.save();
  };
  themeBtn?.addEventListener("click", onTheme);

  const crtBtn = document.getElementById("crtBtn");
  const onCrt = (): void => {
    const next = !runtime.config.get().crt;
    runtime.config.update({ crt: next });
    void runtime.config.save();
  };
  crtBtn?.addEventListener("click", onCrt);

  return () => {
    offConfig();
    themeBtn?.removeEventListener("click", onTheme);
    crtBtn?.removeEventListener("click", onCrt);
  };
}
```

- [ ] **Step 2: Wire it up in `apps/console/src/shell/index.ts`**

```ts
import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";

export async function initShell(runtime: Runtime): Promise<void> {
  initTheme(runtime);
}
```

- [ ] **Step 3: Remove the inline theme + CRT block from `apps/console/index.html`**

Use the Edit tool to delete lines 1909–1951 (the `// --- Theme ---` and `// --- CRT ---` handlers). The exact `old_string` must be found by searching for a unique anchor — use this block:

```
// --- Theme ---
const themeBtn = document.getElementById('themeBtn');
```

...and keep deleting through the `crtBtn.addEventListener(...)` / `applyCrt(localStorage.getItem(...))` block until the next comment header `// --- Tweaks ---` is reached. Replace the whole span with a single blank line.

Practically: use Read on lines 1900–1960 to see the exact text, then Edit once with the unique anchor and the replacement being an empty string.

- [ ] **Step 4: Typecheck + build**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build
```
Expected: both exit 0.

- [ ] **Step 5: Playwright smoke**

```bash
pnpm test:e2e
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/console/src/shell/theme.ts apps/console/src/shell/index.ts apps/console/index.html
git commit -m "feat(shell): runtime-driven theme and CRT toggle"
```

---

## Task 6: Clock module (replaces inline lines 2075–2084)

**Files:**
- Create: `apps/console/src/shell/clock.ts`
- Modify: `apps/console/src/shell/index.ts`
- Modify: `apps/console/index.html` (remove inline clock block)

### Steps

- [ ] **Step 1: Create `apps/console/src/shell/clock.ts`**

```ts
/**
 * Update `#clockStr` (top chrome "sat · apr 18 · 09:14") and `#miniClock`
 * ("09:14:22") on a 1 s interval. Returns a disposer fn.
 */
export function initClock(): () => void {
  const clockStr = document.getElementById("clockStr");
  const mini = document.getElementById("miniClock");

  const tick = (): void => {
    const now = new Date();
    const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()]!;
    const mon = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ][now.getMonth()]!;
    const day = now.getDate();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    if (clockStr) clockStr.textContent = `${dow} · ${mon} ${day} · ${hh}:${mm}`;
    if (mini) mini.textContent = `${hh}:${mm}:${ss}`;
  };

  tick();
  const handle = window.setInterval(tick, 1000);
  return () => window.clearInterval(handle);
}
```

- [ ] **Step 2: Wire into `apps/console/src/shell/index.ts`**

```ts
import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";

export async function initShell(runtime: Runtime): Promise<void> {
  initTheme(runtime);
  initClock();
}
```

- [ ] **Step 3: Remove the inline clock block from `apps/console/index.html`**

Find and delete the block starting with `// Clock tick` through the `setInterval(tick, 1000);` line. The anchor:
```
// Clock tick
function tick() {
```
Use Read to see the exact text (lines ~2075–2085), then Edit to replace with an empty string.

- [ ] **Step 4: Typecheck, build, smoke**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/shell/clock.ts apps/console/src/shell/index.ts apps/console/index.html
git commit -m "feat(shell): runtime-driven clock ticker"
```

---

## Task 7: Nav module + core `go` command (replaces inline lines 1838–1850 partially)

**Files:**
- Create: `apps/console/src/shell/nav.ts`
- Create: `apps/console/src/shell/core-commands.ts`
- Modify: `apps/console/src/shell/index.ts`
- Modify: `apps/console/index.html` (remove inline nav click handlers)

### Steps

- [ ] **Step 1: Create `apps/console/src/shell/core-commands.ts`**

Registers a minimum set of unprefixed core commands. Extended in Task 11.

```ts
import type { Runtime } from "@atlas/core";

export function registerCoreCommands(runtime: Runtime): void {
  runtime.commands.register({
    id: "go",
    hint: "/go <screen>",
    run: (args) => {
      const target = args[0];
      if (!target) return;
      showScreen(target);
    },
  });
}

/**
 * Swap the `.on` class between `.screen` sections. Matches the prototype's
 * `#scr-<id>` id scheme and the nav buttons' `data-scr="<id>"`.
 */
export function showScreen(id: string): void {
  const screens = document.querySelectorAll<HTMLElement>(".screen");
  screens.forEach((s) => s.classList.toggle("on", s.id === `scr-${id}`));
  document.querySelectorAll<HTMLButtonElement>("#screenNav button").forEach((b) => {
    b.classList.toggle("on", b.dataset.scr === id);
  });
  try {
    localStorage.setItem("atlas1c-screen", id);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 2: Create `apps/console/src/shell/nav.ts`**

```ts
import type { Runtime } from "@atlas/core";

/** Wire nav buttons + any `[data-goto]` element to the `go` command. */
export function initNav(runtime: Runtime): () => void {
  const handlers: Array<{ el: Element; h: EventListener }> = [];

  const buttons = document.querySelectorAll<HTMLButtonElement>("#screenNav button[data-scr]");
  buttons.forEach((btn) => {
    const h: EventListener = () => {
      const target = btn.dataset.scr ?? "home";
      void runtime.commands.invoke("go", [target]);
    };
    btn.addEventListener("click", h);
    handlers.push({ el: btn, h });
  });

  document.querySelectorAll<HTMLElement>("[data-goto]").forEach((el) => {
    const h: EventListener = () => {
      const target = el.dataset.goto;
      if (target) void runtime.commands.invoke("go", [target]);
    };
    el.addEventListener("click", h);
    handlers.push({ el, h });
  });

  // Restore last screen if any.
  try {
    const saved = localStorage.getItem("atlas1c-screen");
    if (saved) void runtime.commands.invoke("go", [saved]);
  } catch {
    // ignore
  }

  return () => {
    handlers.forEach(({ el, h }) => el.removeEventListener("click", h));
  };
}
```

- [ ] **Step 3: Wire into `apps/console/src/shell/index.ts`**

```ts
import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";
import { initNav } from "./nav.js";
import { registerCoreCommands } from "./core-commands.js";

export async function initShell(runtime: Runtime): Promise<void> {
  registerCoreCommands(runtime);
  initTheme(runtime);
  initClock();
  initNav(runtime);
}
```

- [ ] **Step 4: Remove the inline nav handlers from `apps/console/index.html`**

Find and delete the block:
```
// --- Screen nav ---
const navBtns = document.querySelectorAll('#screenNav button');
const screens = document.querySelectorAll('.screen');
function showScreen(id) {
...
}
document.querySelectorAll('[data-goto]').forEach(el => {
...
});
```

Also delete the line `const savedScreen = localStorage.getItem('atlas1c-screen');` and any handler that follows it until the next `// --- Onboarding step navigation ---` comment. The onboarding step nav stays for now (replaced in Task 12).

If `showScreen` is referenced elsewhere in the inline script after deletion (grep for it), temporarily keep a thin `function showScreen(id){}` no-op declared OR move that inline call into a `data-goto` attribute. Likely only the onboarding inline script references it — if so, leave that call alone; Task 12 rewrites the onboarding block entirely.

- [ ] **Step 5: Typecheck, build, smoke**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/console/src/shell/nav.ts apps/console/src/shell/core-commands.ts apps/console/src/shell/index.ts apps/console/index.html
git commit -m "feat(shell): nav module and core go command"
```

---

## Task 8: Command bar (replaces inline lines 2087–2095)

**Files:**
- Create: `apps/console/src/shell/cmdbar.ts`
- Modify: `apps/console/src/shell/index.ts`
- Modify: `apps/console/index.html` (remove inline `/` handler)

### Steps

- [ ] **Step 1: Create `apps/console/src/shell/cmdbar.ts`**

```ts
import type { Runtime } from "@atlas/core";
import { parseCommand } from "@atlas/core";

/**
 * Wire the bottom `.cmdbar` input:
 * - pressing "/" from anywhere (except while typing in another input) focuses it
 * - Enter parses + invokes via runtime.commands
 * - Escape blurs
 */
export function initCmdbar(runtime: Runtime): () => void {
  const input = document.querySelector<HTMLInputElement>(".cmdbar .in");
  if (!input) return () => {};

  const onGlobalKey = (e: KeyboardEvent): void => {
    if (e.key !== "/") return;
    const target = e.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
    e.preventDefault();
    input.focus();
  };

  const onKey = async (e: KeyboardEvent): Promise<void> => {
    if (e.key === "Escape") {
      input.blur();
      return;
    }
    if (e.key !== "Enter") return;
    const raw = input.value.trim();
    if (!raw) return;
    input.value = "";
    const parsed = parseCommand(raw);
    if (!parsed.id) return;
    try {
      await runtime.commands.invoke(parsed.id, parsed.args);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  document.addEventListener("keydown", onGlobalKey);
  input.addEventListener("keydown", onKey as (e: Event) => void);
  return () => {
    document.removeEventListener("keydown", onGlobalKey);
    input.removeEventListener("keydown", onKey as (e: Event) => void);
  };
}
```

- [ ] **Step 2: Wire in `apps/console/src/shell/index.ts`**

```ts
import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";
import { initNav } from "./nav.js";
import { initCmdbar } from "./cmdbar.js";
import { registerCoreCommands } from "./core-commands.js";

export async function initShell(runtime: Runtime): Promise<void> {
  registerCoreCommands(runtime);
  initTheme(runtime);
  initClock();
  initNav(runtime);
  initCmdbar(runtime);
}
```

- [ ] **Step 3: Remove the inline `/` handler from `apps/console/index.html`**

Delete the block:
```
// Command bar focus on /
document.addEventListener('keydown', (e) => {
  ...
});
```

- [ ] **Step 4: Typecheck, build, smoke**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/shell/cmdbar.ts apps/console/src/shell/index.ts apps/console/index.html
git commit -m "feat(shell): command bar wired to runtime"
```

---

## Task 9: Statusline bound to `XpStore`

The statusline markup exists in HTML with hard-coded `LVL 17`, `XP 2340/3000`, etc. We'll replace the XP-related pieces with dynamic values from the store. HP/NRG/FOCUS/streak similarly.

**Files:**
- Create: `apps/console/src/shell/statusline.ts`
- Modify: `apps/console/src/shell/index.ts`

No inline deletion — the statusline is pure markup.

### Steps

- [ ] **Step 1: Create `apps/console/src/shell/statusline.ts`**

```ts
import type { Runtime } from "@atlas/core";
import type { XpState } from "@atlas/sdk";

/**
 * Update the existing `#statusline` markup with live stats from the XP store
 * and the game-mode flag from config.
 *
 * The statusline's segments were built statically by the prototype; we locate
 * them by their label text (LVL, HP, NRG, FOCUS, STREAK) and update the value
 * spans next to them.
 */
export function initStatusline(runtime: Runtime): () => void {
  const statusline = document.getElementById("statusline");
  if (!statusline) return () => {};

  const xpPerLevel = runtime.config.get().xpPerLevelBase;

  const render = (state: XpState): void => {
    const gameMode = runtime.config.get().gameMode;
    statusline.style.display = gameMode ? "" : "none";
    if (!gameMode) return;

    setSegmentValue(statusline, "LVL", String(state.lvl));

    const xpInLevel = state.xp - state.lvl * xpPerLevel;
    const xpNext = xpPerLevel;
    setSegmentValue(statusline, "XP", `${xpInLevel}/${xpNext}`);
    setSegmentBar(statusline, "XP", xpInLevel / xpNext);

    setSegmentValue(statusline, "HP", String(state.hp));
    setSegmentBar(statusline, "HP", state.hp / 100);

    setSegmentValue(statusline, "NRG", String(state.nrg));
    setSegmentBar(statusline, "NRG", state.nrg / 100);

    setSegmentValue(statusline, "FOCUS", `${state.focus}/3`);

    setSegmentValue(statusline, "STREAK", `${state.streak}d 🔥`);
  };

  render(runtime.xp.getState());
  const off = runtime.xp.onChange(render);
  const offConfig = runtime.config.subscribe(() => render(runtime.xp.getState()));

  return () => {
    off();
    offConfig();
  };
}

function findSegment(root: HTMLElement, label: string): HTMLElement | null {
  const segs = root.querySelectorAll<HTMLElement>(".seg");
  for (const seg of segs) {
    const k = seg.querySelector(".k");
    if (k && k.textContent?.trim() === label) return seg;
  }
  return null;
}

function setSegmentValue(root: HTMLElement, label: string, value: string): void {
  const seg = findSegment(root, label);
  if (!seg) return;
  const valueSpan = [...seg.children].reverse().find(
    (c): c is HTMLElement => c instanceof HTMLElement && !c.classList.contains("k") && !c.classList.contains("mbar"),
  );
  if (valueSpan) valueSpan.textContent = value;
}

function setSegmentBar(root: HTMLElement, label: string, frac: number): void {
  const seg = findSegment(root, label);
  if (!seg) return;
  const fill = seg.querySelector<HTMLElement>(".mbar .f");
  if (fill) fill.style.right = `${Math.max(0, Math.min(100, 100 - frac * 100))}%`;
}
```

- [ ] **Step 2: Wire in `apps/console/src/shell/index.ts`**

```ts
import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";
import { initNav } from "./nav.js";
import { initCmdbar } from "./cmdbar.js";
import { initStatusline } from "./statusline.js";
import { registerCoreCommands } from "./core-commands.js";

export async function initShell(runtime: Runtime): Promise<void> {
  registerCoreCommands(runtime);
  initTheme(runtime);
  initClock();
  initNav(runtime);
  initCmdbar(runtime);
  initStatusline(runtime);
}
```

- [ ] **Step 3: Typecheck, build, smoke**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/shell/statusline.ts apps/console/src/shell/index.ts
git commit -m "feat(shell): statusline bound to XpStore and config"
```

---

## Task 10: Tweaks panel wired to `ConfigStore` (replaces inline lines 1953–1998)

**Files:**
- Create: `apps/console/src/shell/tweaks.ts`
- Modify: `apps/console/src/shell/index.ts`
- Modify: `apps/console/index.html` (remove inline tweaks block)

### Steps

- [ ] **Step 1: Create `apps/console/src/shell/tweaks.ts`**

```ts
import type { Runtime } from "@atlas/core";

/**
 * Wire the floating tweaks panel (#tweaksPanel) to the ConfigStore.
 * The panel has inputs for: name (#tw-name), accent swatch buttons (.tw-accent[data-c]),
 * CRT checkbox (#tw-crt), game-mode checkbox (#tw-game), density select (#tw-density).
 * The trigger is the #tweakBtn chip in top chrome.
 */
export function initTweaks(runtime: Runtime): () => void {
  const panel = document.getElementById("tweaksPanel");
  const trigger = document.getElementById("tweakBtn");
  if (!panel || !trigger) return () => {};

  const togglePanel = (): void => {
    panel.classList.toggle("open");
  };
  trigger.addEventListener("click", togglePanel);

  const nameInput = document.getElementById("tw-name") as HTMLInputElement | null;
  const crtInput = document.getElementById("tw-crt") as HTMLInputElement | null;
  const gameInput = document.getElementById("tw-game") as HTMLInputElement | null;
  const densityInput = document.getElementById("tw-density") as HTMLSelectElement | null;
  const accentBtns = document.querySelectorAll<HTMLButtonElement>(".tw-accent[data-c]");

  const applyFromConfig = (): void => {
    const c = runtime.config.get();
    if (nameInput) nameInput.value = c.name;
    if (crtInput) crtInput.checked = c.crt;
    if (gameInput) gameInput.checked = c.gameMode;
    if (densityInput) densityInput.value = c.density;
    document.documentElement.style.setProperty("--accent", c.accent);
    accentBtns.forEach((b) => b.classList.toggle("on", b.dataset.c === c.accent));
    // Also update the brand mark since name shows there
    const brand = document.getElementById("brandMark");
    if (brand) brand.textContent = c.name.toUpperCase().replace(/\s+/g, "·");
  };
  applyFromConfig();
  const offConfig = runtime.config.subscribe(applyFromConfig);

  const handlers: Array<{ el: EventTarget; type: string; h: EventListener }> = [];

  const saveAnd = (patch: Parameters<typeof runtime.config.update>[0]): void => {
    runtime.config.update(patch);
    void runtime.config.save();
  };

  if (nameInput) {
    const h: EventListener = () => saveAnd({ name: nameInput.value });
    nameInput.addEventListener("input", h);
    handlers.push({ el: nameInput, type: "input", h });
  }
  if (crtInput) {
    const h: EventListener = () => saveAnd({ crt: crtInput.checked });
    crtInput.addEventListener("change", h);
    handlers.push({ el: crtInput, type: "change", h });
  }
  if (gameInput) {
    const h: EventListener = () => saveAnd({ gameMode: gameInput.checked });
    gameInput.addEventListener("change", h);
    handlers.push({ el: gameInput, type: "change", h });
  }
  if (densityInput) {
    const h: EventListener = () => {
      const v = densityInput.value;
      if (v === "comfy" || v === "compact") saveAnd({ density: v });
    };
    densityInput.addEventListener("change", h);
    handlers.push({ el: densityInput, type: "change", h });
  }
  accentBtns.forEach((btn) => {
    const h: EventListener = () => {
      const c = btn.dataset.c;
      if (c) saveAnd({ accent: c });
    };
    btn.addEventListener("click", h);
    handlers.push({ el: btn, type: "click", h });
  });

  return () => {
    trigger.removeEventListener("click", togglePanel);
    offConfig();
    handlers.forEach(({ el, type, h }) => el.removeEventListener(type, h));
  };
}
```

- [ ] **Step 2: Wire in `apps/console/src/shell/index.ts`**

```ts
import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";
import { initNav } from "./nav.js";
import { initCmdbar } from "./cmdbar.js";
import { initStatusline } from "./statusline.js";
import { initTweaks } from "./tweaks.js";
import { registerCoreCommands } from "./core-commands.js";

export async function initShell(runtime: Runtime): Promise<void> {
  registerCoreCommands(runtime);
  initTheme(runtime);
  initClock();
  initNav(runtime);
  initCmdbar(runtime);
  initStatusline(runtime);
  initTweaks(runtime);
}
```

- [ ] **Step 3: Remove the inline tweaks block from `apps/console/index.html`**

Delete the span that includes the `TWEAK_DEFAULTS` constant, `panel` / `tweakBtn` handlers, `applyAccent` / `applyName` / `applyGame`, `setTweak`, the postMessage EDIT-MODE bridge, and the initial "Apply defaults" invocations. Anchor the `old_string` on:

```
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/
```

...and extend through the `window.parent && window.parent.postMessage({type: '__edit_mode_available'}, '*');` line. The next remaining block is `// Boot onboarding interactions` — keep that one for now (Task 12).

Also delete the initial apply calls at lines ~1912–1921, 1947–1951 (theme/crt initial-apply from localStorage) if they weren't already removed in Task 5.

- [ ] **Step 4: Typecheck, build, smoke**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/shell/tweaks.ts apps/console/src/shell/index.ts apps/console/index.html
git commit -m "feat(shell): tweaks panel bound to ConfigStore"
```

---

## Task 11: Built-in core commands (theme, crt, density, accent, settings, help, vault.reveal)

Extends `registerCoreCommands()` with the rest of the core command set from the spec.

**Files:**
- Modify: `apps/console/src/shell/core-commands.ts`

### Steps

- [ ] **Step 1: Replace `apps/console/src/shell/core-commands.ts`** with:

```ts
import type { Runtime } from "@atlas/core";
import { invoke } from "@tauri-apps/api/core";

export function registerCoreCommands(runtime: Runtime): void {
  runtime.commands.register({
    id: "go",
    hint: "/go <screen>",
    run: (args) => {
      const target = args[0];
      if (target) showScreen(target);
    },
  });

  runtime.commands.register({
    id: "theme",
    hint: "/theme <light|dark>",
    run: (args) => {
      const mode = args[0];
      if (mode === "light" || mode === "dark") {
        runtime.config.update({ theme: mode });
        void runtime.config.save();
      }
    },
  });

  runtime.commands.register({
    id: "crt",
    hint: "/crt <on|off>",
    run: (args) => {
      const v = args[0];
      const next = v === "on" ? true : v === "off" ? false : !runtime.config.get().crt;
      runtime.config.update({ crt: next });
      void runtime.config.save();
    },
  });

  runtime.commands.register({
    id: "density",
    hint: "/density <comfy|compact>",
    run: (args) => {
      const v = args[0];
      if (v === "comfy" || v === "compact") {
        runtime.config.update({ density: v });
        void runtime.config.save();
      }
    },
  });

  runtime.commands.register({
    id: "accent",
    hint: "/accent <#rrggbb>",
    run: (args) => {
      const hex = args[0];
      if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) {
        runtime.config.update({ accent: hex });
        void runtime.config.save();
      }
    },
  });

  runtime.commands.register({
    id: "settings",
    hint: "/settings",
    run: () => showScreen("settings"),
  });

  runtime.commands.register({
    id: "help",
    hint: "/help",
    run: () => {
      const list = runtime.commands.list();
      // eslint-disable-next-line no-console
      console.log("commands:\n" + list.map((c) => `  ${c.hint ?? c.id}`).join("\n"));
    },
  });

  runtime.commands.register({
    id: "?",
    hint: "/?",
    run: () => runtime.commands.invoke("help"),
  });

  runtime.commands.register({
    id: "vault.reveal",
    hint: "/vault.reveal",
    run: async () => {
      try {
        const root = await invoke<string | null>("get_vault_root");
        if (root) await invoke("plugin:shell|open", { path: root });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("vault.reveal failed:", err);
      }
    },
  });
}

export function showScreen(id: string): void {
  const screens = document.querySelectorAll<HTMLElement>(".screen");
  screens.forEach((s) => s.classList.toggle("on", s.id === `scr-${id}`));
  document.querySelectorAll<HTMLButtonElement>("#screenNav button").forEach((b) => {
    b.classList.toggle("on", b.dataset.scr === id);
  });
  try {
    localStorage.setItem("atlas1c-screen", id);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 2: About the `vault.reveal` command** — it invokes the `tauri-plugin-shell`'s `open` command to reveal a folder in the OS file manager. We haven't installed that plugin. Two options:

  - **Skip it for M3**: remove the `vault.reveal` block above. Reveal is a nice-to-have, can land later.
  - **Install now**: add `tauri-plugin-shell = "2.2"` to `src-tauri/Cargo.toml`, register `.plugin(tauri_plugin_shell::init())` in `lib.rs`, add `"shell:default"` to `capabilities/default.json`, and add `@tauri-apps/plugin-shell` to `apps/console/package.json`.

**Choose skip.** For cleanliness, remove the `vault.reveal` command from the file (delete the entire `runtime.commands.register({ id: "vault.reveal", ...})` block plus the `invoke` import at top of file). Also delete `import { invoke } from "@tauri-apps/api/core";` since it's no longer used. A follow-up plan can add reveal with the shell plugin.

Final file after skipping `vault.reveal`:
```ts
import type { Runtime } from "@atlas/core";

export function registerCoreCommands(runtime: Runtime): void {
  runtime.commands.register({ id: "go", hint: "/go <screen>", run: (args) => {
    const t = args[0];
    if (t) showScreen(t);
  }});
  runtime.commands.register({ id: "theme", hint: "/theme <light|dark>", run: (args) => {
    const m = args[0];
    if (m === "light" || m === "dark") { runtime.config.update({ theme: m }); void runtime.config.save(); }
  }});
  runtime.commands.register({ id: "crt", hint: "/crt <on|off>", run: (args) => {
    const v = args[0];
    const next = v === "on" ? true : v === "off" ? false : !runtime.config.get().crt;
    runtime.config.update({ crt: next }); void runtime.config.save();
  }});
  runtime.commands.register({ id: "density", hint: "/density <comfy|compact>", run: (args) => {
    const v = args[0];
    if (v === "comfy" || v === "compact") { runtime.config.update({ density: v }); void runtime.config.save(); }
  }});
  runtime.commands.register({ id: "accent", hint: "/accent <#rrggbb>", run: (args) => {
    const hex = args[0];
    if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) { runtime.config.update({ accent: hex }); void runtime.config.save(); }
  }});
  runtime.commands.register({ id: "settings", hint: "/settings", run: () => showScreen("settings") });
  runtime.commands.register({ id: "help", hint: "/help", run: () => {
    const list = runtime.commands.list();
    // eslint-disable-next-line no-console
    console.log("commands:\n" + list.map((c) => `  ${c.hint ?? c.id}`).join("\n"));
  }});
  runtime.commands.register({ id: "?", hint: "/?", run: () => runtime.commands.invoke("help") });
}

export function showScreen(id: string): void {
  const screens = document.querySelectorAll<HTMLElement>(".screen");
  screens.forEach((s) => s.classList.toggle("on", s.id === `scr-${id}`));
  document.querySelectorAll<HTMLButtonElement>("#screenNav button").forEach((b) => {
    b.classList.toggle("on", b.dataset.scr === id);
  });
  try { localStorage.setItem("atlas1c-screen", id); } catch { /* ignore */ }
}
```

- [ ] **Step 3: Typecheck, build, smoke**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/shell/core-commands.ts
git commit -m "feat(shell): built-in core commands (theme, crt, density, accent, settings, help)"
```

---

## Task 12: Onboarding wizard writes to config (replaces inline lines 1852–1890, 2000–2020)

The prototype already renders the 6 boot steps statically. We replace the inline step-navigation logic with runtime-driven code that reads DOM input values, updates `ConfigStore`, sets the vault root via `TauriVaultFs.setVaultRoot`, persists to `.atlas/config.json`, marks `onboarded: true`, and routes to the home screen.

**Files:**
- Create: `apps/console/src/onboarding/boot.ts`
- Modify: `apps/console/src/main.ts` (branch to onboarding when not onboarded)
- Modify: `apps/console/index.html` (remove inline onboarding/boot step blocks)

### Steps

- [ ] **Step 1: Create `apps/console/src/onboarding/boot.ts`**

```ts
import type { ConfigStore, Runtime } from "@atlas/core";
import type { TauriVaultFs } from "../core/tauri-vault-fs.js";
import { showScreen } from "../shell/core-commands.js";

export interface BootDeps {
  config: ConfigStore;
  vault: TauriVaultFs;
  onComplete: () => Promise<void>;
}

/**
 * Drive the existing boot screen's 6-step wizard. Step elements in the
 * prototype have class `.boot-step` with `data-step="1"`..."6", a stepper
 * with `.stepper [data-step]`, prev/next buttons `#bootPrev`, `#bootNext`,
 * and a `#bootGo` button on step 6.
 *
 * This function attaches listeners, keeps state in local vars, and saves
 * config when "BOOT ATLAS·1" is clicked.
 */
export function initOnboarding(deps: BootDeps): () => void {
  const { config, vault, onComplete } = deps;

  showScreen("boot");

  const steps = document.querySelectorAll<HTMLElement>(".boot-step");
  const prevBtn = document.getElementById("bootPrev");
  const nextBtn = document.getElementById("bootNext");
  const goBtn = document.getElementById("bootGo");
  const counter = document.getElementById("bootCounter");
  const stepperBtns = document.querySelectorAll<HTMLElement>(".stepper [data-step]");

  let current = 1;
  const total = steps.length || 6;

  const setStep = (n: number): void => {
    current = Math.max(1, Math.min(total, n));
    steps.forEach((s) => s.classList.toggle("on", s.dataset.step === String(current)));
    stepperBtns.forEach((b) => b.classList.toggle("on", b.dataset.step === String(current)));
    if (counter) counter.textContent = `${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    if (prevBtn) prevBtn.toggleAttribute("disabled", current === 1);
    if (nextBtn) nextBtn.textContent = current === total ? "BOOT ATLAS·1" : "next →";
    if (goBtn) goBtn.style.display = current === total ? "" : "none";
  };

  setStep(1);

  const onPrev = (): void => setStep(current - 1);
  const onNext = (): void => {
    if (current === total) void finish();
    else setStep(current + 1);
  };

  stepperBtns.forEach((b) => {
    const n = Number(b.dataset.step);
    if (!Number.isNaN(n)) b.addEventListener("click", () => setStep(n));
  });

  prevBtn?.addEventListener("click", onPrev);
  nextBtn?.addEventListener("click", onNext);

  // Capture form values on the fly.
  const nameInput = document.getElementById("bootName") as HTMLInputElement | null;
  nameInput?.addEventListener("input", () => {
    config.update({ name: nameInput.value });
  });

  const classCards = document.querySelectorAll<HTMLElement>(".class-card[data-class]");
  classCards.forEach((card) => {
    card.addEventListener("click", () => {
      classCards.forEach((c) => c.classList.remove("on"));
      card.classList.add("on");
      const cls = card.dataset.class;
      if (cls) config.update({ operator: cls });
    });
  });

  const modChips = document.querySelectorAll<HTMLElement>(".mod-chip[data-mod]");
  modChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("on");
    });
  });

  // Theme / accent / CRT controls on step 4 are named by their ids in the prototype:
  // boot-theme (select), boot-accent buttons .boot-accent[data-c], boot-crt (checkbox),
  // boot-density (select). We support them if present.
  const bootTheme = document.getElementById("boot-theme") as HTMLSelectElement | null;
  bootTheme?.addEventListener("change", () => {
    const v = bootTheme.value;
    if (v === "light" || v === "dark") config.update({ theme: v });
  });
  const bootCrt = document.getElementById("boot-crt") as HTMLInputElement | null;
  bootCrt?.addEventListener("change", () => config.update({ crt: bootCrt.checked }));
  const bootDensity = document.getElementById("boot-density") as HTMLSelectElement | null;
  bootDensity?.addEventListener("change", () => {
    const v = bootDensity.value;
    if (v === "comfy" || v === "compact") config.update({ density: v });
  });
  document.querySelectorAll<HTMLElement>(".boot-accent[data-c]").forEach((b) => {
    b.addEventListener("click", () => {
      const hex = b.dataset.c;
      if (hex) config.update({ accent: hex });
    });
  });

  // Step 5 — pick a vault path.
  const pickBtn = document.getElementById("bootPickVault");
  const vaultPathOut = document.getElementById("bootVaultPath");
  pickBtn?.addEventListener("click", async () => {
    const { pickVaultFolder } = await import("../core/pick-vault-folder.js");
    const picked = await pickVaultFolder();
    if (picked) {
      config.update({ vaultPath: picked });
      if (vaultPathOut) vaultPathOut.textContent = picked;
    }
  });

  async function finish(): Promise<void> {
    const { vaultPath } = config.get();
    if (!vaultPath) {
      // force user back to step 5
      setStep(5);
      return;
    }
    await vault.setVaultRoot(vaultPath);
    config.update({ onboarded: true });
    await config.save();
    await onComplete();
  }

  return () => {
    prevBtn?.removeEventListener("click", onPrev);
    nextBtn?.removeEventListener("click", onNext);
  };
}

/** Convenience wrapper — after onboarding completes, continue to the shell. */
export async function runOnboardingAndBoot(
  vault: TauriVaultFs,
  config: ConfigStore,
  boot: () => Promise<Runtime>,
): Promise<Runtime> {
  return new Promise<Runtime>((resolve, reject) => {
    initOnboarding({
      config,
      vault,
      onComplete: async () => {
        try {
          const runtime = await boot();
          resolve(runtime);
        } catch (err) {
          reject(err as Error);
        }
      },
    });
  });
}
```

- [ ] **Step 2: Update `apps/console/src/main.ts`** to branch on `config.onboarded`:

```ts
import { createRuntime, ConfigStore } from "@atlas/core";
import { TauriVaultFs } from "./core/tauri-vault-fs.js";
import { initShell } from "./shell/index.js";
import { showScreen } from "./shell/core-commands.js";

const VERSION = "0.1.0";

function isTauri(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";
}

async function boot(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Atlas 1 · v${VERSION} · booting`);

  if (!isTauri()) {
    console.log(`Atlas 1 · v${VERSION} · booted`);
    return;
  }

  const vault = new TauriVaultFs();
  let vaultRoot = await vault.getVaultRoot();

  // If Rust has no vault root this session, check if config has a saved path.
  // We can't load config without a vault root, so if neither is set → onboarding.

  if (!vaultRoot) {
    // Attempt 1: read config from the last-used vault path stored in localStorage
    // as a soft-cache (onboarding writes it).
    const cachedPath = (() => {
      try { return localStorage.getItem("atlas1c-vault") ?? ""; } catch { return ""; }
    })();

    if (cachedPath) {
      await vault.setVaultRoot(cachedPath);
      vaultRoot = cachedPath;
    }
  }

  if (!vaultRoot) {
    // Pure first-run: no Rust root, no cached path → onboarding.
    // We need a ConfigStore that can survive until vault root is set; give it a
    // temporary in-memory vault fs so update/save work on a no-op path.
    const { runOnboardingAndBoot } = await import("./onboarding/boot.js");

    // Use the ConfigStore without loading from disk yet. Once vault root is set
    // in finish(), we create the real runtime.
    const tempConfig = new ConfigStore(vault);
    // Intentionally DON'T call await tempConfig.load() — it would throw because
    // vault root isn't set. The store starts with DEFAULT_CONFIG.

    await runOnboardingAndBoot(vault, tempConfig, async () => {
      const rt = await createRuntime({ vault, vaultRoot: tempConfig.get().vaultPath });
      await rt.load();
      await initShell(rt);
      try { localStorage.setItem("atlas1c-vault", tempConfig.get().vaultPath); } catch { /* ignore */ }
      showScreen("home");
      console.log(`Atlas 1 · v${VERSION} · booted`);
      return rt;
    });
    return;
  }

  // Normal boot — vault root exists.
  const runtime = await createRuntime({ vault, vaultRoot });
  await runtime.load();
  await initShell(runtime);

  // Persist the vault path for the next session's fast path.
  try { localStorage.setItem("atlas1c-vault", vaultRoot); } catch { /* ignore */ }

  if (!runtime.config.get().onboarded) {
    // Edge case: vault root set but config says not-onboarded. Drop into onboarding.
    const { initOnboarding } = await import("./onboarding/boot.js");
    initOnboarding({
      config: runtime.config,
      vault,
      onComplete: async () => {
        await runtime.config.save();
        showScreen("home");
      },
    });
  } else {
    showScreen("home");
  }

  console.log(`Atlas 1 · v${VERSION} · booted`);
}

window.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("atlas boot failed:", err);
  });
});
```

- [ ] **Step 3: Remove the inline onboarding / boot blocks from `apps/console/index.html`**

Delete:
- The `// --- Onboarding step navigation ---` block (lines 1852–1890 in the original, with step counter + prev/next wiring).
- The `// Boot onboarding interactions` block (class-card, mod-chip, bootName input, pluginToggle click handler — lines 2000–2020 in the original).
- Any call to `showScreen(...)` that no longer has a JS-side definition — note that Task 7 moved `showScreen` into a TS module, so the HTML's inline definition is already gone. Any lingering inline references to it are dead; delete them.

Keep: the decorative inline scripts for the piano heatmap and GitHub contribution grid (those are pure visual generators).

After this task, the inline `<script>` block should be much smaller — ideally just the heatmap + grid renderers, and the `// --- Settings section switcher ---` / plugin-tab block (which stays for now; M7 wires it properly).

- [ ] **Step 4: Typecheck, build, smoke**

```bash
pnpm --filter @atlas/console typecheck && pnpm --filter @atlas/console build && pnpm test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/onboarding/ apps/console/src/main.ts apps/console/index.html
git commit -m "feat(shell): onboarding wizard persists to config"
```

---

## Task 13: Manual Tauri verification + milestone tag

**Files:** none — verification only.

### Steps

- [ ] **Step 1: Full workspace typecheck + unit tests**

```bash
cd /c/Users/jford/OneDrive/Projects/Atlas-1 && pnpm typecheck && pnpm test && pnpm test:e2e
```
Expected: all pass. @atlas/core tests: 57 passes (unchanged). @atlas/console tests: 9 passes (new in Task 3). Playwright: 1 pass.

- [ ] **Step 2: Rust build sanity**

```bash
export PATH="/c/Users/jford/.cargo/bin:$PATH" && cd src-tauri && cargo check && cd ..
```
Expected: success.

- [ ] **Step 3: Run the app end-to-end**

```bash
export PATH="/c/Users/jford/.cargo/bin:$PATH" && pnpm tauri:dev
```

When the window opens, verify the onboarding flow end-to-end:
1. The boot screen appears with step 1 of 6.
2. Type a name → it shows up in the brand mark live.
3. Step through to step 5, click "pick vault folder" → a native OS folder picker opens. Pick any empty folder (e.g. `~/atlas-test`).
4. Advance to step 6, click "BOOT ATLAS·1".
5. The home screen appears. Statusline shows LVL 0, HP 0, etc. (no data yet).
6. Type `/theme dark` in the command bar → theme flips.
7. Type `/crt on` → scanlines appear.
8. Type `/go settings` → settings screen.
9. Close the window.
10. Re-run `pnpm tauri:dev`. The app should skip onboarding and go straight to home with the saved theme/CRT/accent.
11. Confirm `.atlas/config.json` exists in the chosen vault folder and contains the expected values.

- [ ] **Step 4: Tag the milestone**

```bash
git tag -a m3-shell-wiring -m "M3: runtime wired to shell, onboarding persists to vault"
```

---

## Definition of done

M3 is complete when:

1. `pnpm typecheck` + `pnpm test` + `pnpm test:e2e` all pass.
2. `cargo check` in `src-tauri/` succeeds.
3. A fresh launch of `pnpm tauri:dev` with no prior vault walks the user through onboarding, writes `.atlas/config.json`, and lands on the home screen.
4. A second launch with an existing vault skips onboarding and restores theme/accent/CRT from config.
5. Command bar `/theme dark` flips the theme live and persists to `.atlas/config.json`.
6. Nav tab clicks work (they invoke `go` under the hood).
7. Statusline LVL/HP/NRG/FOCUS/STREAK reflect `XpStore` state (zeros on a brand-new vault).
8. `git status` clean, `m3-shell-wiring` tag exists.

Out of scope (later milestones):
- Tasks / Journal / Habits plugins (M4/M5).
- Rituals and global shortcut (M6).
- Settings screen full wiring (M7).
- Distribution / release signing (M8).
- Vault reveal command (needs `tauri-plugin-shell`; defer).

## Risks and mitigations

- **Inline-script deletions break a screen.** Mitigation: each task runs Playwright smoke, which catches screen-render regressions. The smoke test's nav-button visibility assertion would catch total breakage.
- **Tauri IPC schema mismatch.** Mitigation: the `TauriVaultFs` unit tests mock `invoke` and assert exact command names + argument shapes that match `vault.rs` command signatures. If the Rust argument names diverge from the TS call sites, either the Rust build fails (unused params) or the runtime throws a clear IPC error.
- **`__TAURI_INTERNALS__` detection is not an official API.** Mitigation: it's used only to short-circuit in a non-Tauri preview. If the flag changes in a future Tauri version, the fallback is that a `pnpm dev` preview shows a loading state — not a release blocker.
- **Onboarding DOM ids diverge from prototype.** If the existing HTML uses different element ids than the plan assumes (`#bootPrev`, `#bootNext`, `#bootPickVault`, etc.), the onboarding wizard will silently do nothing. Mitigation: Task 12 includes an explicit manual verification step. If an id is missing, the implementer can add it to the HTML before wiring.
