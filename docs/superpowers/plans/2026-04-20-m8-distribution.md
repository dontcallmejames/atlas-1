# M8 — Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Atlas 1 as a forkable open-source project with CI, tagged releases producing desktop installers on Windows/macOS/Linux, and docs that let a new contributor clone-and-run in under 5 minutes.

**Architecture:** Two GitHub Actions workflows — one for CI (runs on every push/PR, fast feedback via pnpm test + typecheck on Ubuntu) and one for Release (triggered by `v*` tags, matrix-builds Tauri installers across three OSes using `tauri-apps/tauri-action`, uploads artifacts to a GitHub Release). Human-facing docs (README, CONTRIBUTING, RELEASING) get rewritten for forkers, not just the author.

**Tech Stack:** GitHub Actions, `tauri-apps/tauri-action@v0`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `dtolnay/rust-toolchain@stable`, Swatinem/rust-cache.

---

## File Structure

**Create:**
- `.github/workflows/ci.yml` — push/PR verification (lint, typecheck, unit tests on Ubuntu).
- `.github/workflows/release.yml` — tag-triggered matrix build producing installers.
- `CONTRIBUTING.md` — dev setup, plugin authoring pointer, commit style, test commands.
- `docs/RELEASING.md` — author-only release cutting checklist.
- `.github/ISSUE_TEMPLATE/bug_report.md` — minimal bug template.
- `.github/ISSUE_TEMPLATE/feature_request.md` — minimal feature template.

**Modify:**
- `README.md` — replace stub quickstart with badges, screenshot note, forking-friendly intro, plugin-authoring pointer.
- `package.json:2-4` — bump version `0.1.0` → `0.8.0` to reflect M1–M8 progress.
- `src-tauri/tauri.conf.json:3` — sync version to `0.8.0`.
- `src-tauri/Cargo.toml` — sync crate version to `0.8.0`.

**Out of scope (documented as v2+):**
- Code signing (Windows Authenticode, macOS notarization) — deferred until there's budget and user demand.
- Auto-update via `tauri-plugin-updater` — deferred; users re-download installers.
- Homebrew/winget/apt repos — deferred; GitHub Releases only.

---

## Task 1: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    name: typecheck + unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test

      - name: Build webview
        run: pnpm build
```

- [ ] **Step 2: Verify the file is well-formed YAML**

Run: `node -e "require('js-yaml') ? 0 : 0" 2>/dev/null; npx --yes yaml-lint .github/workflows/ci.yml`

Expected: no error output. If `yaml-lint` is unavailable, just run `cat .github/workflows/ci.yml` and eyeball the indentation (2 spaces, no tabs).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add push/PR workflow for typecheck + unit tests"
```

---

## Task 2: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow file**

Rationale: `tauri-apps/tauri-action` creates a draft release on first matrix job, subsequent jobs attach their platform's installers to the same release. `GITHUB_TOKEN` is auto-provided.

```yaml
name: release

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    name: build ${{ matrix.platform }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: ubuntu-22.04
            target: ""
          - platform: macos-latest
            target: ""
          - platform: windows-latest
            target: ""

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Rust build
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install Linux system deps
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf \
            build-essential \
            curl \
            wget \
            file \
            libssl-dev \
            libayatana-appindicator3-dev

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Atlas 1 ${{ github.ref_name }}"
          releaseBody: |
            See CHANGELOG or commit history for what's new.

            Installers below. Atlas 1 is unsigned — you'll see a warning on Windows SmartScreen and Gatekeeper on macOS. See the README for how to trust the binary.
          releaseDraft: true
          prerelease: false
```

- [ ] **Step 2: Eyeball the YAML**

Run: `cat .github/workflows/release.yml`

Expected: matrix block has three entries, no tabs, indentation consistent.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow for Windows/macOS/Linux installers"
```

---

## Task 3: Issue templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`

- [ ] **Step 1: Create bug report template**

```markdown
---
name: Bug report
about: Something broke or behaved unexpectedly
title: ""
labels: bug
---

**What happened?**

**What did you expect to happen?**

**Steps to reproduce:**
1.
2.
3.

**Environment:**
- OS:
- Atlas 1 version (Settings → About, or `package.json`):
- Built from source or released installer?

**Logs / screenshots (optional):**
```

- [ ] **Step 2: Create feature request template**

```markdown
---
name: Feature request
about: Idea for a new capability or improvement
title: ""
labels: enhancement
---

**What's the problem you're trying to solve?**

**What would the ideal behavior look like?**

**Have you considered implementing it as a plugin first?**
Atlas 1 is plugin-based. Many features should ship as plugins rather than core changes. See `CONTRIBUTING.md`.
```

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "docs: add bug report and feature request issue templates"
```

---

## Task 4: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write the file**

```markdown
# Contributing to Atlas 1

Thanks for your interest. Atlas 1 is an open-source life console designed to be forked and extended. This doc covers the shortest path from clone to useful change.

## Dev setup

Prerequisites: Node 20+, pnpm 9+, Rust stable, and your platform's Tauri prerequisites (https://v2.tauri.app/start/prerequisites).

```bash
git clone https://github.com/dontcallmejames/atlas-1.git
cd atlas-1
pnpm install
pnpm tauri:dev
```

First Tauri build takes 2–5 minutes (compiling Rust). Subsequent starts are fast.

## Repo layout

- `apps/console/` — the webview UI (TypeScript, Lit-free vanilla DOM).
- `src-tauri/` — Rust backend: window, FS IPC, global shortcut.
- `packages/sdk/` — plugin authoring interfaces. **Read this first if you're writing a plugin.**
- `packages/core/` — runtime: command registry, vault adapter, event bus, XP store, rituals.
- `plugins/{tasks,journal,habits}/` — built-in v1 plugins. Plain JavaScript with JSDoc types.
- `docs/superpowers/specs/` — design specs.
- `docs/superpowers/plans/` — per-milestone implementation plans.

## Writing a plugin

A plugin is a directory under `plugins/<id>/` with a `main.js` exporting a default class that implements `Plugin` from `@atlas/sdk`.

Minimum viable plugin:

```js
/** @typedef {import("@atlas/sdk").Plugin} Plugin */
/** @typedef {import("@atlas/sdk").PluginContext} PluginContext */

export default class HelloPlugin {
  /** @param {PluginContext} ctx */
  async onload(ctx) {
    ctx.commands.register({
      id: "greet",
      title: "Say hello",
      run: async () => {
        ctx.events.emit("ui:toast", { message: "hello" });
      },
    });
  }

  /** @param {PluginContext} _ctx */
  async onunload(_ctx) {}
}
```

Reference: the three built-in plugins (`plugins/tasks`, `plugins/journal`, `plugins/habits`) cover the common patterns — command registration, vault IO, XP awards, UI views, and event subscriptions. Read those before reading `packages/core`; the SDK surface is the contract.

## Tests

```bash
pnpm test        # unit tests across all packages and plugins
pnpm typecheck   # tsc across the workspace
pnpm test:e2e    # Playwright smoke test (requires pnpm build first)
```

Add a test for every behavior change. Each package uses Vitest — see existing `*.test.ts` / `*.test.js` files for patterns.

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `test:`. Keep subject under 72 chars. Body explains *why*, not *what*.

## Before opening a PR

1. `pnpm typecheck && pnpm test` — both green.
2. Rebase on `main`.
3. PR description: what, why, how you tested.

## Questions

Open a discussion or issue. This is a small project — direct is fine.
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md with dev setup and plugin authoring guide"
```

---

## Task 5: Rewrite README

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Replace README.md with the forker-friendly version**

```markdown
# Atlas 1

> **Life console** — terminal × game HUD for managing calendar, hobbies, health, work, play, and AI projects. Local-first, plain-text vault, plugin-based. Open-source and forkable.

[![ci](https://github.com/dontcallmejames/atlas-1/actions/workflows/ci.yml/badge.svg)](https://github.com/dontcallmejames/atlas-1/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## What it is

Atlas 1 is a single desktop app that pulls the parts of your life worth tracking — tasks, journal, habits, rituals — into one keyboard-driven console. Everything lives as plain text in a folder you own. Everything extensible is a plugin.

Why a fork, not an account: your data stays local, your instance is yours, and the author's opinions (XP bars, HP/NRG/FOCUS, terminal aesthetic) are one fork away from whatever you prefer.

## Install (released installer)

Grab the latest installer for your OS from the [Releases page](https://github.com/dontcallmejames/atlas-1/releases).

Atlas 1 is not code-signed. You'll see a warning:
- **Windows:** SmartScreen → "More info" → "Run anyway".
- **macOS:** Right-click the `.app` → Open → "Open anyway".
- **Linux:** `chmod +x` the AppImage if needed.

On first launch the onboarding wizard walks you through naming your instance and picking a vault folder.

## Install (run from source)

```bash
git clone https://github.com/dontcallmejames/atlas-1.git
cd atlas-1
pnpm install
pnpm tauri:dev
```

**Prerequisites:** Node 20+, pnpm 9+, Rust stable, and your platform's Tauri prerequisites: https://v2.tauri.app/start/prerequisites.

## Use it

Press `Ctrl+Shift+Space` (configurable) from anywhere to bring Atlas forward with the command bar focused. Some starter commands:

- `/tasks.add buy milk` — add a task. `/tasks.done 1`, `/tasks.list`.
- `/journal.today` — open today's daily note.
- `/habits.log meditate` — log a habit completion.
- `/ritual morning` — run a ritual (chain of commands from a `.ritual` file).
- `/go settings` — open the settings panel. `/go home`, `/go tasks`.

## Fork it

Atlas 1 is built to be forked. Your fork is your instance — change the plugin set, the aesthetic, the default rituals, the onboarding copy. The SDK contract (`packages/sdk/`) is stable; the runtime is yours to bend.

Start here: [`CONTRIBUTING.md`](./CONTRIBUTING.md) — dev setup, repo layout, how to write a plugin.

## Repo layout

- `apps/console/` — webview UI (TypeScript).
- `src-tauri/` — Rust backend.
- `packages/sdk/` — plugin authoring API (start here for plugin authors).
- `packages/core/` — runtime.
- `plugins/{tasks,journal,habits}/` — built-in plugins.
- `docs/superpowers/specs/` — design specs.
- `docs/superpowers/plans/` — implementation plans.

## Build a distributable yourself

```bash
pnpm tauri:build
# installers land in src-tauri/target/release/bundle/
```

## License

MIT — see [LICENSE](./LICENSE).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for forkers — badges, install flows, plugin pointer"
```

---

## Task 6: RELEASING.md

**Files:**
- Create: `docs/RELEASING.md`

- [ ] **Step 1: Write the release checklist**

```markdown
# Releasing Atlas 1

Author-only checklist for cutting a release. Triggered by pushing a `v*` tag; the `release.yml` workflow builds installers for Windows, macOS, and Linux and attaches them to a draft GitHub Release.

## Steps

1. **Make sure `main` is green.** CI badge on README should be passing.

2. **Update versions in lockstep.** These three files must all match:
   - `package.json` — `"version"` field.
   - `src-tauri/tauri.conf.json` — `"version"` field.
   - `src-tauri/Cargo.toml` — `[package] version` field.

   ```bash
   # example for 0.9.0
   npm version --no-git-tag-version 0.9.0   # updates package.json
   # then edit src-tauri/tauri.conf.json and src-tauri/Cargo.toml by hand
   ```

3. **Update `src-tauri/Cargo.lock`.**

   ```bash
   (cd src-tauri && cargo check)
   ```

4. **Commit the version bump.**

   ```bash
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "chore: bump version to 0.9.0"
   ```

5. **Tag and push.**

   ```bash
   git tag v0.9.0
   git push origin main --tags
   ```

6. **Watch the `release` workflow.** It creates a draft release and attaches installers from all three matrix jobs. Takes ~15–25 minutes.

7. **Edit the draft release.** Replace the default body with a short changelog. Publish when ready.

## Versioning

Semver. Pre-1.0: minor bumps can break things. Milestone bumps (M1→M8) follow the minor version: `0.1` shipped M1, `0.8` ships M8.

## If a build fails

Check the workflow log. Common causes:
- Linux system deps changed — update the `apt-get install` list in `release.yml`.
- Tauri major version change — re-check `tauri-apps/tauri-action` pinned version compatibility.
- Lockfile drift — run `pnpm install` locally and commit.

Delete the tag locally and on origin, fix, re-tag, re-push.

```bash
git tag -d v0.9.0
git push origin :refs/tags/v0.9.0
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/RELEASING.md
git commit -m "docs: add release cutting checklist"
```

---

## Task 7: Bump version to 0.8.0

**Files:**
- Modify: `package.json:3` — `"version": "0.1.0"` → `"version": "0.8.0"`.
- Modify: `src-tauri/tauri.conf.json:3` — `"version": "0.1.0"` → `"version": "0.8.0"`.
- Modify: `src-tauri/Cargo.toml` — `version = "0.1.0"` → `version = "0.8.0"` in the `[package]` table.

- [ ] **Step 1: Read the current Cargo.toml to locate the version line**

Run: `grep -n '^version' src-tauri/Cargo.toml`

Expected: one line like `version = "0.1.0"` in the `[package]` section.

- [ ] **Step 2: Edit package.json**

Change the `"version"` field:

```json
{
  "name": "atlas-1",
  "version": "0.8.0",
```

- [ ] **Step 3: Edit src-tauri/tauri.conf.json**

Change the `"version"` field:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Atlas 1",
  "version": "0.8.0",
```

- [ ] **Step 4: Edit src-tauri/Cargo.toml**

Change the `version` line under `[package]`:

```toml
version = "0.8.0"
```

- [ ] **Step 5: Refresh Cargo.lock**

Run: `cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo check && cd ..`

Expected: `cargo check` completes with no errors; `Cargo.lock` updated to reference `0.8.0`.

- [ ] **Step 6: Verify the three versions match**

Run:
```bash
grep '"version"' package.json
grep '"version"' src-tauri/tauri.conf.json
grep '^version' src-tauri/Cargo.toml
```

Expected: all three show `0.8.0`.

- [ ] **Step 7: Commit**

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to 0.8.0 (M1–M8 shipped)"
```

---

## Task 8: Verify workflows locally (lint, dry-run)

**Files:** none modified; verification only.

- [ ] **Step 1: Install `act` is optional — skip if not already on the machine.** Instead, sanity-check the YAML by rendering through `yq` if available, else just re-read both files:

Run:
```bash
cat .github/workflows/ci.yml
cat .github/workflows/release.yml
```

Expected: both files print cleanly, `on:` triggers are correct (`push`/`pull_request` to main for CI, `push.tags: [v*]` for release), matrix has three entries.

- [ ] **Step 2: Verify full unit-test suite still green at the new version**

Run: `pnpm test`

Expected: all 169+ tests pass. The version bump must not have broken anything.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 4: Verify webview build**

Run: `pnpm build`

Expected: `apps/console/dist/` populated, no errors.

- [ ] **Step 5: No commit** — this task is verification only. If any step fails, fix the underlying cause before proceeding to Task 9.

---

## Task 9: Tag M8 and push to origin

**Files:** none modified.

- [ ] **Step 1: Confirm working tree is clean**

Run: `git status`

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Create the milestone tag**

Run:
```bash
git tag m8-distribution
git tag v0.8.0
```

Expected: two tags created with no error.

- [ ] **Step 3: Push commits and tags**

Run:
```bash
git push origin main
git push origin m8-distribution v0.8.0
```

Expected: commits and tags pushed. The `v0.8.0` tag triggers the release workflow on GitHub.

- [ ] **Step 4: Watch the release workflow**

Open `https://github.com/dontcallmejames/atlas-1/actions` in a browser.

Expected: the `release` workflow appears, with three matrix jobs (ubuntu-22.04, macos-latest, windows-latest). They complete in 15–25 minutes. When done, a **draft** release appears at `https://github.com/dontcallmejames/atlas-1/releases` with installers attached.

- [ ] **Step 5: Publish the release**

In the GitHub UI, edit the draft release, replace the body with a short changelog (M1–M8 summary), and click **Publish release**.

---

## Self-review notes

**Spec coverage:** Spec §M8 asks for CI, release workflow, install docs, forker's README. Task 1 covers CI. Task 2 covers release workflow. Tasks 4–6 cover install docs and forker README. Version alignment (Task 7) is required before the release workflow can tag cleanly. Task 8 is pre-flight verification. Task 9 is the actual release cut. No gaps.

**Placeholder scan:** No "TBD", no "handle edge cases". Workflow YAML is complete; README/CONTRIBUTING/RELEASING are full files; version numbers are literal (`0.8.0`). Task 8 has no commit because it's verification-only, which is explicit.

**Type consistency:** No types involved (YAML, Markdown, TOML/JSON version fields). Version `0.8.0` is used consistently across Tasks 7 and 9.
