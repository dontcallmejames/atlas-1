# M13 — A11y + Responsive (Tier 3 Group E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "keyboard-first" claim actually true (a11y pass) and let the app stop lying about window size (responsive breakpoints). Closes Tier-3 rows #16 and #17 — the last two rows in the entire debt roadmap.

**Architecture:** Two independent tasks. A11y is the larger refactor — it converts the most-used clickable `<div>`s to `<button>`s, adds a global `:focus-visible` rule, ARIA to two live regions, and a `prefers-reduced-motion` stanza. Responsive is pure CSS — drop the hard-coded viewport, add two breakpoints. Both are web-only changes (no Rust, no SDK, no plugins).

**Tech Stack:** HTML, CSS, vanilla TS/JS (handler signatures unchanged).

---

## File Structure

**Modify:**
- `apps/console/index.html`
  - Remove `<meta name="viewport" content="width=1280">`
  - Convert the five high-traffic clickable patterns to `<button type="button">`:
    - `.mod-chip` (onboarding step 3, tweaks panel density chips)
    - `.class-card` (onboarding step 2)
    - `.loadout-card` (onboarding step 3)
    - `.swatch` (accent swatches)
    - `.onb-btn` chip-style buttons (if currently `<div>`)
  - Add `aria-live="polite"` to `.statusline` and the REPL `.out`
  - Add `aria-label` to the `.badge.locked` pattern (currently renders `?` with no semantics)
- `apps/console/public/console.css`
  - Add `:focus-visible` rule applying accent outline + offset globally
  - Add `@media (prefers-reduced-motion: reduce)` block that zeroes animations (`blink`, CRT scanlines, onboarding slide, toast)
  - Add breakpoints at `(max-width: 1100px)` and `(max-width: 900px)` adjusting `.term-grid` and `.stats-row`
  - Make `.stats-row` use `repeat(auto-fit, minmax(120px, 1fr))` so it already flexes on narrower windows
- `apps/console/src/onboarding/boot.ts` (if mod-chip/class-card click handlers need to be re-attached after the button conversion — they likely don't, since `element.addEventListener("click", ...)` works on `<button>` the same way)
- `docs/TECH-DEBT.md` — flip rows #16 and #17 from 🔴 to 🟢

**Out of scope (v2+):**
- Full semantic markup overhaul (landmarks, skip links, etc.) — this pass covers the highest-traffic interactive elements, not every div in the file.
- Screen-reader test via NVDA/VoiceOver — requires live testing, not subagent work.
- Touch-friendly layout — this is a desktop app; touch is far off.
- High-contrast theme — deferred to theming work.

---

## Task 1: A11y pass

**Files:**
- Modify: `apps/console/index.html`
- Modify: `apps/console/public/console.css`
- (Possibly touch: `apps/console/src/onboarding/boot.ts` if handler attachment breaks; verify first)

**Approach:** convert elements in-place from `<div class="X">…</div>` to `<button type="button" class="X">…</button>`. The existing CSS selectors are class-based, so the visual styling carries over. Any JavaScript that did `addEventListener("click", …)` on the element works identically on a button. The semantic win is automatic tabindex, automatic Enter/Space activation, automatic `role="button"`, and screen readers announce them as buttons.

- [ ] **Step 1: Inventory the clickable div patterns**

Run:

```bash
grep -n 'class="mod-chip"\|class="class-card"\|class="loadout-card"\|class="swatch"' apps/console/index.html | wc -l
```

Record the count. This is how many elements will be touched.

- [ ] **Step 2: Convert `.mod-chip` elements**

All `<span class="mod-chip"…>…</span>` and `<div class="mod-chip"…>…</div>` become `<button type="button" class="mod-chip"…>…</button>`. Keep every attribute (style, data-*, onclick if any). Do not change class lists.

The mod-chip exists in:
- Onboarding step 3 (module selector chips)
- Tweaks panel density selection (if present)
- Onboarding step 1 (name suggestions — these are clickable too)

Use `replace_all` in Edit for classes with many instances, but first verify the surrounding markup is uniform. If any instance has different surrounding attributes, handle them individually.

- [ ] **Step 3: Convert `.class-card` elements**

The five class cards in onboarding step 2 (`the polymath`, `the operator`, `the maker`, `the artisan`, `the explorer`) become `<button type="button" class="class-card" data-class="…">` instead of `<div>`. The `data-class` attribute and all inner markup carries over.

- [ ] **Step 4: Convert `.loadout-card` elements**

Same treatment on onboarding step 3's loadout cards.

- [ ] **Step 5: Convert `.swatch` elements**

Accent swatches in tweaks panel + onboarding step 4. `<div class="swatch" data-color="…">` → `<button type="button" class="swatch" data-color="…">`.

- [ ] **Step 6: Leave low-traffic clickables alone — scope discipline**

Do NOT convert `.tline`, `.modlist li[data-goto]`, `.repo` list items, `#pluginToggle`, sticky notes, or any other one-off clickable element in this pass. They either are decorative with no JS click handler, or they're screen-specific items best handled when those screens get real rendering. Scope for this task is the onboarding + tweaks path only.

- [ ] **Step 7: Add `aria-live` to the two dynamic regions**

In `apps/console/index.html`:

- Find `<div class="statusline" id="statusline">` → add `role="status" aria-live="polite" aria-atomic="false"`
- Find the REPL transcript container (the `.out` div inside home). Add `aria-live="polite" aria-atomic="false"`.

These announcements tell screen readers when HP/NRG/FOCUS update or when a new REPL line appears.

- [ ] **Step 8: Add `aria-label` to locked badges**

Find `<div class="badge locked">?</div>` patterns. Change to `<div class="badge locked" aria-label="locked badge">?</div>`. There should be a small number — don't miss any. Use grep to locate all instances.

- [ ] **Step 9: Add global `:focus-visible` rule to console.css**

Add near the top of `console.css` (after the theme variable blocks, before module-specific styles):

```css
/* Keyboard focus ring — apply only when focus is visible (keyboard, not mouse). */
:focus {
  outline: none;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
/* Chips and cards that already have a border should inset the ring slightly. */
.chip:focus-visible,
.onb-btn:focus-visible,
.mod-chip:focus-visible,
.class-card:focus-visible,
.loadout-card:focus-visible,
.swatch:focus-visible {
  outline-offset: 1px;
}
```

- [ ] **Step 10: Add `@media (prefers-reduced-motion: reduce)` block**

Append to `console.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001s !important;
  }
  .blink { animation: none; }
  .crt::after { display: none; }
  .onb-panel { transform: none !important; }
  .toast { animation: none; }
}
```

- [ ] **Step 11: Verify the button conversions do not break styling**

Some CSS rules that target `div.mod-chip` or `.mod-chip:hover` may have layout quirks when applied to `<button>` (buttons have native padding, font-family, border). The codebase likely does not use those defaulted selectors (everything in the SASS-equivalent is class-based), but confirm with:

```bash
pnpm build
```

If the build succeeds and visual inspection confirms the chips still look right in the dev server, proceed. If a button default is leaking through (e.g., thicker border, unwanted font change), add this to `console.css`:

```css
button.mod-chip,
button.class-card,
button.loadout-card,
button.swatch,
button.onb-btn {
  font: inherit;
  background: transparent;
  border: inherit;
  padding: inherit;
  cursor: pointer;
  color: inherit;
}
```

Only add this if needed — default button styling may not affect these classes given they already set background/border/color explicitly.

- [ ] **Step 12: Typecheck + tests + build**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: 183+ tests still pass; clean typecheck; successful build.

- [ ] **Step 13: Commit**

```bash
git add apps/console/index.html apps/console/public/console.css
git commit -m "a11y: convert clickable divs to buttons + focus-visible + ARIA + reduced-motion"
```

---

## Task 2: Responsive layout

**Files:**
- Modify: `apps/console/index.html` (drop the viewport meta)
- Modify: `apps/console/public/console.css`

**Approach:** remove the fixed 1280-px viewport meta so the browser scales to the real window width. Add two breakpoints: at `<1100px` the right pane collapses, at `<900px` all three panes stack vertically. Make `.stats-row` flex automatically so it already degrades gracefully between those breakpoints.

- [ ] **Step 1: Drop the viewport meta**

In `apps/console/index.html`, find `<meta name="viewport" content="width=1280">` (near the top of `<head>`). Replace with:

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

- [ ] **Step 2: Make `.stats-row` flexible**

Current rule is `grid-template-columns: repeat(5, 1fr)`. Locate it in `console.css` and replace with:

```css
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}
```

(Keep any other properties the rule had.)

Do the same for other fixed-column grids in module panes if the layout obviously breaks below 1100px. The review specifically flagged `.class-grid: repeat(3,1fr)` and `.heatmap.strip: repeat(30,1fr)`. For `.class-grid`, allow it to wrap:

```css
.class-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}
```

Leave `.heatmap.strip` alone — 30 columns at minimal cell width is fine even on narrow windows; the cells shrink to a few px each, which is the intended dense visualization.

- [ ] **Step 3: Add the 1100-px breakpoint**

Append to `console.css`:

```css
@media (max-width: 1100px) {
  /* Collapse the right status pane — third column disappears; main + nav pane remain. */
  .term-grid {
    grid-template-columns: 200px 1fr;
  }
  .term-grid > aside.pane:nth-child(3) {
    display: none;
  }
}
```

The `.term-grid > aside.pane:nth-child(3)` selector targets the right-most pane assuming the structure is `aside.pane | main.pane | aside.pane`. If the structure differs on some screens, the selector may need adjusting — verify by testing each screen.

- [ ] **Step 4: Add the 900-px breakpoint**

Append:

```css
@media (max-width: 900px) {
  /* Stack panes vertically. Nav pane first, main pane second. */
  .term-grid {
    grid-template-columns: 1fr;
  }
  .term-grid > aside.pane:first-child {
    border-right: none;
    border-bottom: var(--rule) solid var(--line);
    max-height: 180px;
  }
  .pane-body {
    max-height: none;
  }
}
```

`max-height: 180px` on the nav pane keeps the module list from dominating the vertical space when stacked. Scrollbar auto-hides kick in if the list overflows (already handled by M9.1 scrollbar work).

- [ ] **Step 5: Visual smoke**

This is manual — the subagent cannot resize a Tauri window. The subagent should **NOT** launch `tauri:dev`. Instead:

- Build the webview: `pnpm --filter @atlas/console build`
- Open `apps/console/dist/index.html` in a browser (or `pnpm --filter @atlas/console preview`).
- Resize the window between 700px and 1500px. Verify:
  - Above 1100px: three-pane layout
  - 900-1100px: two-pane (right pane hidden)
  - Below 900px: single-column stacked

If that verification is too tall an order for the subagent, skip it and flag for the human.

- [ ] **Step 6: Typecheck + tests + build**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/console/index.html apps/console/public/console.css
git commit -m "ui: responsive layout — drop 1280 viewport + add <1100 & <900 breakpoints"
```

---

## Task 3: Flip tech-debt + bump version + push

**Files:**
- Modify: `docs/TECH-DEBT.md`, `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`

- [ ] **Step 1: Flip #16 and #17 to 🟢**

In the Tier 3 table.

- [ ] **Step 2: Run full verification**

```bash
pnpm typecheck && pnpm test && (cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo test)
```

Expected: typecheck clean; 183+ JS tests pass; 4 Rust tests pass.

- [ ] **Step 3: Bump version to 0.13.0**

Three files in lockstep (per `docs/RELEASING.md`):
- `package.json` → `"version": "0.13.0"`
- `src-tauri/tauri.conf.json` → `"version": "0.13.0"`
- `src-tauri/Cargo.toml` → `version = "0.13.0"`

Refresh `Cargo.lock`:

```bash
cd src-tauri && PATH="/c/Users/jford/.cargo/bin:$PATH" cargo check && cd ..
```

- [ ] **Step 4: Commit + tag + push**

```bash
git add docs/TECH-DEBT.md package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump to 0.13.0 + mark Tier 3 Group E complete (M13)"
git push origin main
git tag m13-a11y-and-responsive
git tag v0.13.0
git push origin m13-a11y-and-responsive v0.13.0
```

The `v0.13.0` tag triggers the release workflow.

---

## Self-review notes

**Scope coverage:** Tier-3 rows #16 and #17 → Tasks 1 and 2. Row #16 is scoped to the high-traffic onboarding + tweaks clickables, not every div — that's an intentional limit flagged in Step 6. Row #17 is scoped to the three-pane `.term-grid` and the `.stats-row` / `.class-grid` sub-grids.

**No placeholders:** every CSS block is literal. Every grep command is concrete. The viewport meta replacement is exact.

**Risk:** Task 1's `<div>` → `<button>` conversion may surface CSS defaults (font-family, padding, border) that the existing rules don't override. Step 11 provides the escape hatch. Smoke-test the tweaks panel and onboarding flow visually after the commit — Tauri dev is needed because subagent can't run it.

**Ordering:** Task 1 and Task 2 both touch `console.css` and `index.html`. Run them **sequentially** in one implementer session to avoid conflicts. Task 3 follows.
