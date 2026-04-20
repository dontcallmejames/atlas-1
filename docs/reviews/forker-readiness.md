# Forker Readiness Review — Atlas 1

## Summary

A skilled JS/TS dev who has never seen the repo can realistically get the app running and a "hello" plugin registered in **~60–90 minutes**, provided their Tauri prerequisites are already in order (otherwise add 30–60 minutes for Rust toolchain + platform deps). The docs are surprisingly tight for a 0.8.0 project: README, CONTRIBUTING, and RELEASING are all present, honest, and short. The biggest barrier is **plugin-authoring onboarding**: there is no minimal template plugin, no scaffolding command, the SDK has no per-type doc comments, and new authors are told to "read the three built-in plugins" — each of which is 150–400 lines and conflates the SDK contract with domain logic. A dev writing their first plugin will copy-paste `plugins/tasks/` and trim. Secondary barriers: no `ARCHITECTURE.md`, no GitHub repo topics, no PR template, and the README never explains what actually happens when you run `pnpm tauri:dev` for the first time inside a fork (vault picker, onboarding wizard, where plugins load from).

## Strengths

- README answers what / why / how-to-run in one screenful, and calls out the fork thesis explicitly.
- CONTRIBUTING has a working 15-line "minimum viable plugin" snippet — unusual and valuable.
- Each built-in plugin has its own `README.md` with a "Fork pointers" section — excellent pattern.
- `docs/RELEASING.md` is complete and forker-reusable (version-bump lockstep across three files is surfaced).
- `.gitignore` is clean and covers the Tauri/pnpm/Playwright footguns.
- MIT license present; CI and release workflows exist and are wired to `v*` tags.
- SDK surface is genuinely small (6 files, ~100 lines total) — easy to grok once found.
- Bug + feature issue templates exist and the feature template pushes authors toward "implement as plugin first" — right incentive.
- Built-in plugin loader (`apps/console/src/boot/built-in-plugins.ts`) is short and readable; a forker can trace it in 2 minutes.

## Findings

### [HIGH] No plugin template or scaffold — new authors copy-paste the most complex reference
- **Location:** `plugins/` (no `template/`, no `create-atlas-plugin`)
- **Issue:** A first-time plugin author has three choices: hand-type from the 15-line CONTRIBUTING snippet (which only covers `commands.register`), copy `plugins/tasks/` (207 lines in `main.js`, plus a parser, plus tests, plus a `manifest.json`, plus a `package.json` with a Vitest dep), or read six SDK files and guess. All three are higher-friction than "copy `plugins/template/` and rename."
- **Impact:** This is the single biggest determinant of time-to-first-plugin. Expect most forkers to abandon or produce lower-quality plugins.
- **Recommendation:** Add `plugins/template/` with `manifest.json`, `package.json`, `main.js` showing one command + one event subscription + one XP award + one vault write, plus a README that points to the three real plugins for deeper patterns. Wire a `pnpm new:plugin <id>` script that copies it and swaps the id.

### [HIGH] No ARCHITECTURE.md or diagram — "where does execution start?" takes more than 60 seconds
- **Location:** repo root (absent)
- **Issue:** A reader has to find `apps/console/src/main.ts` themselves, then understand that (a) it's both a Tauri build and a browser preview, (b) plugins are statically globbed by Vite at build time, (c) `packages/core` exposes `createRuntime`, (d) `packages/sdk` is types-only, (e) the Rust side lives in `src-tauri/`. The README "Repo layout" section lists dirs but doesn't diagram the call graph.
- **Impact:** Slows code-level onboarding. Forkers who want to, say, add a new system surface (new `ui` API method) won't know which three files to edit.
- **Recommendation:** Add `docs/ARCHITECTURE.md` with a 200-word text diagram: `main.ts → createRuntime → loadBuiltInPlugins → initShell`; show the SDK↔core↔console↔Tauri boundary; note that `packages/sdk` is the stable contract and everything below it can be forked freely.

### [HIGH] SDK has no doc comments on the types forkers actually need
- **Location:** `packages/sdk/src/plugin.ts`, `commands.ts`, `events.ts`, `vault.ts`, `xp.ts`, `config.ts`
- **Issue:** `NavApi`, `UiApi`, `SettingsApi`, `ThemeApi` are single-line interfaces with no JSDoc. `EventMap` has a great augmentation comment but `EventApi`, `VaultFs`, `XpApi`, `CommandApi` are undocumented. The only fully-commented file is `events.ts`. `plugin.ts` has a single stub comment calling some types M2/M3 placeholders — alarming for a v0.8 "stable SDK" claim in the README.
- **Impact:** Plugin authors have to infer behavior from the three reference plugins. E.g. a new author cannot tell from `UiApi.registerView`'s signature that the `loader` must return `{ render: (el: HTMLElement) => void }` — that contract is enforced by the shell but nowhere typed or documented.
- **Recommendation:** Add TSDoc to every interface member in `packages/sdk/src/*.ts`. In particular, type the view loader return shape. Remove or restate the "M2/M3 stub" comment in `plugin.ts` so the SDK reads as stable.

### [HIGH] No single "plugin interface" entry point in the SDK
- **Location:** `packages/sdk/src/index.ts` (just six re-exports)
- **Issue:** A reader has to open six files to assemble the contract. There is no top-of-file overview in `index.ts` or `plugin.ts` saying "a plugin is a class with onload(ctx); here are the eight things on ctx and where each is defined."
- **Impact:** Doubles the time to understand the API surface.
- **Recommendation:** Add a file-level JSDoc block at the top of `packages/sdk/src/index.ts` that enumerates `PluginContext` members with one-line descriptions and links. Alternatively, a `docs/PLUGIN_API.md` that flattens the six files into one reference page.

### [MEDIUM] CONTRIBUTING's "minimum viable plugin" snippet is missing required artifacts
- **Location:** `CONTRIBUTING.md:30-53`
- **Issue:** The snippet shows a class with `commands.register({ id: "greet", ... })` but does not show: (a) the required `manifest.json` (id, version, atlas range, main, permissions), (b) that command ids inside a plugin get automatically namespaced to `<pluginId>.<id>` (verified in `plugins/tasks/main.js` — the plugin registers `id: "add"` but users type `/tasks.add`), (c) the `package.json` the plugin needs, (d) that Vite statically globs `plugins/*/main.js` at build time so a hot-added plugin requires a dev-server restart. A forker following the snippet literally will not end up with a working plugin.
- **Impact:** Forker runs `pnpm tauri:dev`, types `/greet`, nothing happens, files an issue or gives up.
- **Recommendation:** Expand the snippet to include `manifest.json`, `package.json`, the id-namespacing behavior, and the "restart dev server after adding a plugin directory" gotcha. Or replace it with "copy `plugins/template/` and edit main.js" once the template exists.

### [MEDIUM] No CODEOWNERS, no PR template
- **Location:** `.github/` (missing `CODEOWNERS`, `pull_request_template.md`)
- **Issue:** Forkers cloning as a template have no PR template to inherit, and the upstream repo has no CODEOWNERS to route plugin-vs-core-vs-docs changes.
- **Impact:** Low on a one-author project, but this repo is explicitly pitched as "forkable" — forkers would benefit from a PR template they keep as-is.
- **Recommendation:** Add `.github/pull_request_template.md` mirroring the "what / why / how you tested" ask from CONTRIBUTING. CODEOWNERS optional.

### [MEDIUM] GitHub repo metadata is under-filled
- **Location:** GitHub (verified via `gh repo view dontcallmejames/atlas-1`)
- **Issue:** `repositoryTopics: null`, `homepageUrl: ""`, `isTemplate: false`, no social preview image set.
- **Impact:** Discoverability. A repo tagged `tauri`, `life-console`, `plain-text`, `plugin-architecture`, `local-first`, `typescript` gets found by the right people. Also: because this is designed to be forked as a starting point, **`isTemplate: true`** would be the single highest-ROI flag flip — GitHub adds a "Use this template" button that starts a fresh repo without history.
- **Recommendation:** Set topics, add a homepage URL (even to the README anchor), flip "Template repository" on, and upload a social preview (a screenshot of the CRT HUD — there's material in `design/`).

### [MEDIUM] README doesn't document what happens on first run
- **Location:** `README.md §Use it`
- **Issue:** README jumps from `pnpm tauri:dev` straight to slash commands without saying: on first launch you'll see an onboarding wizard that asks you to name your instance and pick a vault folder. A forker thinks something is broken when a modal appears.
- **Impact:** Minor confusion, but sharp edges matter for the first-60-minutes impression.
- **Recommendation:** One sentence after the install block: "First run opens an onboarding wizard (name the instance, pick a vault folder). Everything Atlas writes lives in that folder as plain text."

### [MEDIUM] `.editorconfig` + `.npmrc` + engines fine, but no `.nvmrc` or Volta pin
- **Location:** repo root
- **Issue:** README and `package.json` say Node 20+, pnpm 9+. No file a version manager can read to auto-switch.
- **Impact:** First-run friction on Node 18/22 systems; install will proceed then fail later with cryptic errors.
- **Recommendation:** Add `.nvmrc` (`20`) and a `volta` stanza in `package.json`.

### [LOW] Hard-coded "Atlas" / "ATLAS·1" strings in code paths not covered by the rename wizard
- **Location:** `apps/console/index.html:6` (`<title>Atlas 1 — Life Console</title>`), `:19` (`<div class="brand">ATLAS·1</div>`), `:40` (`<span>ATLAS·1</span>`); `apps/console/src/main.ts:14` (`Atlas 1 · v${VERSION} · booting` log); `packages/*/package.json` names (`@atlas/sdk`, `@atlas/core`, `@atlas/console`); plugin packages (`@atlas-plugin/tasks`); localStorage key `atlas1c-vault` in `main.ts:35`; Rust identifier in `src-tauri/`.
- **Issue:** The onboarding wizard lets a user rename their instance at runtime, but a forker who wants to rebrand the repo itself (`Orbit`, `Vessel`, `Lodge`) has to touch ~30 files and rename npm scopes (`@atlas/*` → `@orbit/*`). Grep across the repo (excluding node_modules) shows 342+ "atlas" occurrences in 30 files; ~53 of those are in `apps/console/src` alone.
- **Impact:** Rename is tedious but mechanical. Not a blocker, but deflates the "truly forkable" pitch.
- **Recommendation:** Either (a) add a `scripts/rename-fork.mjs` that does the find-and-replace + package rename + lockfile refresh, or (b) document the rename scope in CONTRIBUTING with a grep recipe and an ordered checklist (npm scopes first, then src strings, then Tauri identifier, then `atlas1c-vault` localStorage key).

### [LOW] Plugin IDs in `commands.register` are namespaced by the loader, but the SDK type doesn't say so
- **Location:** `packages/sdk/src/commands.ts:14` vs. `plugins/tasks/main.js:34`
- **Issue:** The `Command.id` JSDoc says `"must be dot-namespaced for plugin commands"` but the `tasks` plugin registers `id: "add"` (not `"tasks.add"`) and it works because the core namespaces it. The documented contract and the actual runtime disagree.
- **Impact:** Plugin authors copy-paste from tasks, it works, they ship. Plugin authors read the SDK doc, prefix manually, and now their command is `/tasks.tasks.add`.
- **Recommendation:** Update the JSDoc on `Command.id` to reflect reality: "For plugin commands, register the bare verb (e.g. `add`) — the runtime prefixes it with `<pluginId>.`."

### [LOW] Windows contributor gotchas not mentioned
- **Location:** CONTRIBUTING.md (absent)
- **Issue:** The global `CLAUDE.md` flags Windows quirks (EEXIST on Edit/Write, heredoc workarounds) and Tauri on Windows requires WebView2 + MSVC Build Tools. README defers to the Tauri prerequisites page, which covers WebView2 but forkers on Windows who hit `Thumbs.db` or line-ending issues won't find anything in the repo.
- **Impact:** Low — Tauri's own docs cover the big items.
- **Recommendation:** One "Platform notes" subsection in CONTRIBUTING with Windows/macOS/Linux bullet points, or a link to a troubleshooting doc.

### [LOW] Badges are thin
- **Location:** `README.md:5-6`
- **Issue:** Only CI + license. No version badge, no "made with Tauri," no Node/pnpm version, no "uses conventional commits," no Discord/discussions link (though these may not exist yet).
- **Impact:** Cosmetic.
- **Recommendation:** Add a version badge auto-sourced from `package.json` or the latest release, and a "Tauri 2" badge linking to the Tauri site. Skip community badges until there's community.

### [LOW] `docs/RELEASING.md` is forker-useful but not forker-aware
- **Location:** `docs/RELEASING.md`
- **Issue:** The doc is written for "you, the author of atlas-1." A forker repurposing it has to mentally rename references. The three-file version lockstep (`package.json`, `tauri.conf.json`, `Cargo.toml`) would be easier to automate.
- **Impact:** Low.
- **Recommendation:** Add a note at the top: "If you've forked Atlas, this checklist works as-is once you rename the app identifier in `src-tauri/tauri.conf.json`." Optionally, add a `scripts/bump-version.mjs` that updates all three files + runs `cargo check` + commits.

## Missing artifacts

- `plugins/template/` reference plugin (minimal, ~40 lines, single command + XP award + vault write).
- `pnpm new:plugin <id>` script or `create-atlas-plugin` binary.
- `docs/ARCHITECTURE.md` with a call-graph and the SDK/core/console/Tauri boundary.
- `docs/PLUGIN_API.md` — flattened reference for the six SDK files.
- TSDoc on every member of `NavApi`, `UiApi`, `SettingsApi`, `ThemeApi`, `VaultFs`, `CommandApi`, `XpApi`.
- `.github/pull_request_template.md`.
- `.github/CODEOWNERS` (optional).
- `.nvmrc` and/or Volta pin in `package.json`.
- GitHub social preview image.
- GitHub repo topics and `isTemplate: true` flip.
- `scripts/rename-fork.mjs` or a rename checklist in CONTRIBUTING.
- CHANGELOG.md (v0.8.0 shipped but there's no authored changelog in-repo for forkers to learn the project's cadence from).

## Not reviewed

- Actual correctness of `pnpm tauri:dev` on a fresh Windows/macOS/Linux box (would require a clean VM).
- `.github/workflows/ci.yml` and `release.yml` internals (checked they exist; did not audit matrix coverage, caching, or secrets).
- `packages/core` implementation quality — only skimmed for the plugin loader entry point.
- `src-tauri/` Rust code for renaming friction and IPC surface stability.
- Whether the v0.8.0 release on GitHub actually has installers attached (release artifacts not verified).
- Whether `@atlas/sdk` is or will be published to npm — currently `private: true`, but third-party plugin authors outside the monorepo would need a published SDK or a documented copy-paste strategy.
- Test coverage of the SDK (SDK has no tests: `"test": "echo \"no tests in sdk yet\" && exit 0"` in `packages/sdk/package.json`).
- Security model for third-party plugins (`manifest.json` declares `permissions` but the loader in `apps/console/src/boot/built-in-plugins.ts` does not appear to enforce them — out of scope for this review, but flag-worthy).
