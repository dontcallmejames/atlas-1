# Atlas 1 — Tech Debt Roadmap

Source: five-agent parallel review on 2026-04-20. Full reports: [`docs/reviews/`](./reviews/).

Items are prioritized across three tiers. Tier 1 is being executed in **M9** (plan: [`docs/superpowers/plans/2026-04-20-m9-tier1-fixes.md`](./superpowers/plans/2026-04-20-m9-tier1-fixes.md)). Tiers 2 and 3 are queued.

Status legend: 🔴 not started · 🟡 in progress · 🟢 done · ⚪ deferred to v2+

---

## Tier 1 — Close the promise/implementation gap (M9)

| # | Item | Source | Status |
|---|------|--------|--------|
| 1 | Wire or remove dead SDK surfaces — `registerStatuslineSegment`, `settings.register`, `theme.*`, `Command.keybind`, `XpState.streak` | code-quality HIGH, forker-readiness HIGH | 🟢 |
| 2 | Fix onboarding — explicit vault-picker step, wire summary to real choices, keyboard nav (Enter/Esc) | uiux HIGH | 🔴 |
| 3 | Command-bar MVP feedback — autocomplete-on-type, visible error on unknown command, up-arrow history | uiux HIGH | 🔴 |
| 4 | Remove advertised-but-unwired shortcuts from Home/cmdbar chrome | uiux HIGH | 🔴 |
| 5 | Dedupe boot sequence in `apps/console/src/main.ts` into a single `startRuntime()` | code-quality HIGH | 🟢 |

## Tier 2 — Before promoting the repo / v1.0

| # | Item | Source | Status |
|---|------|--------|--------|
| 6 | Canonicalize vault paths in Rust (`src-tauri/src/vault.rs:resolve_inside`) — `fs::canonicalize` + symlink check | security HIGH | 🔴 |
| 7 | Set a strict CSP in `tauri.conf.json` | security HIGH | 🔴 |
| 8 | Document plugin trust model in `CONTRIBUTING.md` — built-ins are trusted, `scopeVaultFs` is defence-in-depth | security HIGH + forker-readiness | 🔴 |
| 9 | Add `plugins/template/` + `pnpm new:plugin <id>` script | forker-readiness HIGH | 🔴 |
| 10 | TSDoc on every SDK member (`packages/sdk/src/*.ts`) + top-of-`index.ts` overview | forker-readiness HIGH | 🔴 |
| 11 | Flip GitHub repo to "Template repository" + add topics + social preview | forker-readiness MEDIUM (highest-ROI toggle) | 🔴 |
| 12 | Collapse two `.atlas/plugins.json` representations; route built-in loader through `PluginLoader` | code-quality HIGH | 🔴 |

## Tier 3 — Perf & polish

| # | Item | Source | Status |
|---|------|--------|--------|
| 13 | Strip demo markup from `index.html` → mount points only (~90 kB drop) | perf MEDIUM | 🔴 |
| 14 | Replace `js-yaml` in habits with hand parser or switch to JSON (~40 kB drop) | perf MEDIUM | 🔴 |
| 15 | Move `xp.load()` off critical boot path; add snapshot/compaction | perf MEDIUM | 🔴 |
| 16 | A11y pass — clickable `div`s → `<button>`, `:focus-visible`, ARIA on statusline + REPL, `prefers-reduced-motion` | uiux HIGH (a11y) | 🔴 |
| 17 | Responsive layout — drop `width=1280` meta, add <1100 px breakpoints | uiux MEDIUM | 🔴 |
| 18 | Add `docs/ARCHITECTURE.md` + `docs/PLUGIN_API.md` | forker-readiness HIGH (docs) | 🔴 |
| 19 | Delete unused `lit` dep; validate plugin ids with strict regex | perf LOW + security LOW | 🔴 |

---

## Deferred to v2+ (out of scope for v1)

From security review:
- Real plugin sandbox (Web Workers or iframe-srcdoc + `postMessage` bridge) — current trust model is "built-ins only, trusted code."
- Enforce manifest `permissions` at load time.
- Move `set_vault_root` to a one-shot onboarding-only IPC.

From perf review:
- Swap Rust sync `fs` handlers to `tokio::fs` when concurrency demand appears.
- Stream-parse xp.log line-by-line.
- `vault.walk` IPC command to replace journal's N+1 listing.

From code-quality review:
- Cron grammar: ranges (`1-5`), steps (`*/5`), lists (`1,15,30`).
- Unify `todayDate()` utilities across plugins.
- `XpStore` — split `delta` semantics into `set` vs `adjust`.
- Ritual loader / plugin-state / xp-store: add `console.warn` on malformed lines.

From uiux review (polish ideas — not tracked as debt, but parked):
- Live boot-log animation.
- Cursor continuity (cmdbar mirrors into Home REPL transcript).
- Class-card hover preview in onboarding.
- Quest completion toast.
- Statusline context-switches on settings screen.
- Screen-transition fade (gated on `prefers-reduced-motion`).
- Light-mode paper-grain texture.

From forker-readiness:
- `scripts/rename-fork.mjs` — automate the 342-occurrence "atlas" rename.
- `CHANGELOG.md`.
- `.github/pull_request_template.md`, `CODEOWNERS`.
- `.nvmrc` + Volta pin.

---

## How to use this doc

- When opening a new Claude session to work on Atlas, point it here.
- Update the **Status** column as items ship — preserve the source attribution so the context isn't lost.
- New findings from future reviews append below the existing tiers.
