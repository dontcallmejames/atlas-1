# UI/UX Review — Atlas 1

## Summary
The design has a distinctive, confident point of view and the terminal × game-HUD metaphor is executed with unusual discipline: monospace everywhere, pane-per-column layout, ASCII banners, HP/NRG/FOCUS statusline, REPL transcript, quest cards, and sticky-note nudges all speak the same language. The Home screen and the module views (Health, Projects, Hobbies) are genuinely cohesive and read as one product. What undermines the design are rough edges at the seams: the onboarding wizard has no vault-picker step (it is grafted on at "BOOT"), keyboard shortcuts advertised on the Home screen are not actually wired up, the command bar has no autocomplete / history / error feedback beyond console.error, and accessibility is thin across the board (no aria, no visible focus rings on chrome buttons/chips, semantic buttons missing on many clickable `div`s). The fixed `width=1280` viewport and 220/1fr/280 three-column grid mean the app simply does not respond to resizing. In short: the aesthetic lands; the interactive contract around it still has large gaps.

## Aesthetic cohesion
The metaphor holds together very well in static layout and typography: ASCII banners, `~/path` pane headers, `$`-prefixed REPL prompts, the `[1] [2] [3]` pane numbering, `.kbd` chips, the sticky-note accent, the phosphor dark theme with CRT scanlines. The game layer (HP/NRG/FOCUS, XP chips, `lvl N`, badges, streaks, quest MAIN/SIDE/DAILY) is woven through every module, and a top-level `game mode` toggle (Appearance settings) lets someone strip it off — a smart escape hatch. Two places where the tone slips:

- **Settings › identity** uses generic form rows and a plain `<input>` with no terminal framing — the cursor, prompt, and dash lines that make the rest of the app feel like a shell are missing here.
- **Onboarding "BOOT ATLAS·1 →" primary button** is a drop-shadowed orange pill, which reads more like a SaaS CTA than a terminal affordance. The `accent` outlined-box style used in `.class-card.pick` would be more on-brand.

The `.hand` (Caveat-style) sticky notes and the tomato accent do a lot of work warming up what would otherwise feel austere — good call.

## Findings

### [HIGH] Onboarding is out of sync with its own runtime — no vault-picker step
- **Location:** `apps/console/index.html:319-594` (panels 0–5), `apps/console/src/onboarding/boot.ts:23` (comment), `boot.ts:105-123`
- **Issue:** The stepper promises six steps: name · loadout · modules · theme · import · ready. The "import" step (step 4) shows integrations and a "data path: ~/atlas-1/vault/" but offers no picker. When the user clicks "BOOT ATLAS·1 →" on the ready step, `initOnboarding` silently opens a Tauri folder dialog if no vault is set. The task prompt explicitly flags "sensible default on last step (vault picker)" — the current UX is the opposite of that: a surprise system dialog at boot.
- **Impact:** Users who read the import step as "skip is fine" (as the panel literally says) and continue will be jolted by a native folder dialog they did not expect, with no explanation of what it is for. If they cancel, `onGo` returns silently and nothing happens — they are stuck with a disabled/re-enabled BOOT button and no error copy.
- **Recommendation:** Promote vault location to a first-class control. Either (a) add a "vault path" row to step 4 alongside the "data path" copy with an inline "[ pick folder... ]" button, or (b) insert step 5 "vault" before "ready," moving ready to step 6 and growing the stepper. On step 6, show the chosen path in the summary (`onb-summary`) — right now the summary hard-codes `~/atlas-1/vault/` which is not the real path. When cancellation happens, surface a boot-log line: `[..] waiting for vault folder — pick one to continue`.

### [HIGH] Onboarding state is cosmetic — selections do not drive the summary
- **Location:** `apps/console/index.html:561-568`, `boot.ts:101-103`
- **Issue:** The summary on step 6 is static HTML: "the polymath", "calendar · health · tasks · hobbies · projects · home (6)", "light · paper · ■ tomato · default density", "integrations: none". Selecting a different class in step 2, toggling modules in step 3, picking dark + amber in step 4, or flipping integrations in step 5 does **not** change the summary. The code in `boot.ts` confirms: mod chips just toggle a class with no persistence, theme/accent/integration panels have no JS at all.
- **Impact:** Users who change anything during onboarding are shown a summary that lies to them. They may not notice during setup, then find their "polymath" modules when they actually picked "the maker."
- **Recommendation:** Either (a) make the selections real — wire theme/accent chips to `config.update`, persist mod chip state, and render the summary from `config.get()` — or (b) lower expectations: on step 6, replace the hard-coded summary with a soft "you can change all of this later in settings" panel until the wiring lands. Do not show specific choices that aren't actually chosen.

### [HIGH] Command bar has no feedback — typing, autocomplete, errors, or history
- **Location:** `apps/console/src/shell/cmdbar.ts`, `apps/console/index.html:1777-1787`
- **Issue:** The cmdbar is the product's primary interaction model, but on Enter it runs the command and clears. There is no autocomplete while typing (the `/help` command prints to DevTools console, not to the UI), no error surfacing (`catch(err) { console.error(err) }`), no up-arrow history, no success toast, and no indication when an unknown command is entered (`parseCommand` returns no id → silently nothing happens). The placeholder `press ⌘K for palette` advertises a palette that does not exist, and the hints row (`⌘K palette`, `⌘/ ask`, `g t today`, `g h health`, `F focus`) lists shortcuts that are **not** wired in anywhere in the repo — only `/` to focus and Escape to blur exist.
- **Impact:** This is the feature the app is built around, and it silently drops input. First-run users typing "/tasks" or a typo will assume the app is broken. Shortcut chips in both the cmdbar and Home right rail that don't work erode trust in all other chips.
- **Recommendation:** Ship an MVP of feedback: (1) a floating suggestion list above the cmdbar that filters `runtime.commands.list()` as the user types, showing `id` + `hint`; (2) Enter on an unknown command writes an inline error pill `✗ unknown command: foo — /help to list` and leaves the input populated; (3) Up/Down arrow cycles a local history buffer; (4) replace the placeholder's `⌘K for palette` copy with something the product actually does (e.g. `type a command — / for suggestions, ↑ for history`). Separately, either implement the `g t / g h / F / ⌘K / ⌘/` bindings or remove them from the hints row and Home keys panel.

### [HIGH] Many clickable elements are non-semantic `div`s and are not keyboard-reachable
- **Location:** `index.html` — `.mod-chip` (throughout), `.class-card` (:373–436), `.loadout-card` (:1339–1382), `.swatch` (:1409–1416), `.tline`/`.modlist li[data-goto]` (:59–82 and many other screens), `.pt-btn`'s sibling `.onb-btn` chip-style buttons, `#pluginToggle` (:456)
- **Issue:** For a product that advertises "keyboard-driven," a huge number of interactive elements are `<div>`s with click handlers attached in JS. They are not in the tab order, have no `role="button"`, no `aria-pressed` for toggles, and the CSS has no `:focus-visible` rule at all — only `:focus { outline: none; }` on `.set-input`. Keyboard-only users and screen-reader users cannot reach or operate onboarding class cards, module chips, swatches, loadout cards, repo list items, or timeline rows.
- **Impact:** The product's core claim (keyboard-first) is only true for the cmdbar. The rest of the UI is mouse-only. Screen readers will announce the statusline as an unstructured wall of numbers.
- **Recommendation:** Convert clickable `div`s to `<button type="button">` (the visual style already works on `<button>` because the chrome already does this). Add a global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` rule. Add `aria-pressed` to toggle chips (`.mod-chip`, swatches, density chips). Add `aria-label`/`aria-live="polite"` to the statusline vitals and REPL `.out` so screen readers can announce updates.

### [MEDIUM] Fixed 1280-px viewport and non-responsive three-column grid
- **Location:** `index.html:5` (`<meta name="viewport" content="width=1280">`); `console.css:151-156` (`.term-grid { grid-template-columns: 220px 1fr 280px; }`); hard-coded pixel widths throughout (`.settings-layout: 220px 1fr`, `.class-grid: repeat(3,1fr)`, `.stats-row: repeat(5,1fr)`, `.heatmap.strip: repeat(30,1fr)`)
- **Issue:** The app is a Tauri desktop window but the viewport meta and layout assume a single ~1280px width. At 1024-wide windows the 30-cell strip heatmap and five-column `.stats-row` collapse each cell to ~35 px and text overflows. There are no `@media` breakpoints in the stylesheet.
- **Impact:** Users on 1366×768 laptops (still common) or with the window docked to half the screen will see cramped, overflowing, and occasionally clipped UI.
- **Recommendation:** Drop the `width=1280` meta (or change to `width=device-width`). Add one or two breakpoints: below ~1100 px collapse the right pane into a bottom drawer or toggle; below ~900 px stack panes vertically. Constrain `.stats-row` to `repeat(auto-fit, minmax(120px, 1fr))`.

### [MEDIUM] Keyboard shortcuts in chrome & Home key panel are advertised but not wired
- **Location:** `index.html:301-310` (Home KEYS panel), `index.html:1780-1786` (cmdbar hints), various kbd chips on Home (`⌘.`, `⌘⇧.`, `⌘/`), Boot panel step 6 (`⌘,`, `⌘K`, `⌘T`)
- **Issue:** Nothing in `shell/` registers these bindings. `core-commands.ts` has no `runtime.keybindings` registrations for any of them. The Settings › keybindings pane (`keybindings.ts`) is a read-only table of registered commands with their `keybind` field, which is empty for all current commands.
- **Impact:** Users are taught a vocabulary the app does not understand. Once they try one and nothing happens, the whole keys UI becomes decorative.
- **Recommendation:** Wire at least the critical ones (`⌘K` palette, `⌘,` settings, `⌘T` theme toggle, `g h / g t / g p / g s` vim-style screen nav, `/` focus cmdbar — this last one already works). Everything else should be removed from the hint displays until implemented. In `keybindings.ts`, show "unbound" explicitly rather than a blank cell so the state is legible.

### [MEDIUM] Onboarding progress communicates step count but not the review-before-commit contract
- **Location:** `boot.ts:44-59`, `index.html:577-588`
- **Issue:** The stepper and `02 / 06` progress readout are good. What's missing: there is no "keyboard to navigate" affordance that matches what the UI claims (`ESC back`, `⏎ next`, `TAB accept defaults`). `boot.ts` only wires click handlers on prev/next/go and the stepper. Pressing Enter anywhere in onboarding does not advance; Escape does not go back; Tab just moves focus to the next form element.
- **Impact:** The footer teaches keyboard shortcuts that do not exist — double injury, given the product's identity.
- **Recommendation:** Add a `keydown` handler at the `boot-wrap` level: Enter → `onNext()` (or `onGo()` on last step), Escape → `onPrev()`, Tab on empty input → `onNext()`. Focus the first form element of each panel on `setStep`.

### [MEDIUM] Global shortcut (Ctrl+Shift+Space) is invisible to users
- **Location:** `apps/console/src/boot/global-shortcut.ts`, `README.md:38`, Onboarding step 6
- **Issue:** The app's only truly differentiated feature — a system-wide hotkey — is mentioned in README but nowhere in-app. The Settings › keybindings table does not list it. Onboarding step 6 ("first things to try") doesn't mention it. If registration fails (shortcut taken by another app), the user sees nothing and assumes the feature doesn't exist.
- **Impact:** The user most likely to value this (power users) never discovers it. Failed registration is silent.
- **Recommendation:** (a) Add a dedicated row to Onboarding step 6's "first things to try" panel: `· press ⌃⇧Space from any app to summon atlas`. (b) Add a `Global Shortcut` row to Settings › Appearance (or a new `Settings › System`) with an editable value and a status dot (green = registered, red + tooltip = failed with OS error). (c) On registration failure, toast a nudge the first time.

### [MEDIUM] Settings appearance screen exists twice — static HTML + JS-rendered
- **Location:** `index.html:1388-1470` (static `.set-sec[data-sec="appearance"]` with nice chips/toggles), `apps/console/src/settings/appearance.ts` (wipes it on render with `el.innerHTML = ""` and rebuilds a minimal version with `<select>` and raw `<input type="checkbox">`)
- **Issue:** The rendered settings screen looks dramatically worse than the mockup: plain select dropdowns, no `.swatch` colored swatches, no `.mod-chip` density pills, no `.toggle` custom switch, no `Typography` section, no `sounds` toggle. Same pattern in `identity.ts` which drops the avatar, the loadout grid, and the tagline help text.
- **Impact:** The polished appearance a user sees in the static mockup is replaced at runtime by generic form controls — the aesthetic the product is built on collapses on the screen where the user is most likely to tinker and first compare Atlas to other apps.
- **Recommendation:** Either (a) keep the static HTML and bind handlers in-place (`querySelector(".swatch")` + attach click listeners) without `innerHTML = ""`, or (b) port the `.swatch`, `.mod-chip`, `.toggle`, `.loadout-card`, `.avatar-placeholder` CSS components into the JS renderers. Option (a) is faster and preserves copy-cohesion.

### [MEDIUM] Plugins in Settings show a different UI from the mockup
- **Location:** `index.html:1472-1572` (gorgeous `.plug-list` with icons, badges, versions, deps, toggle; plus tabs for installed/registry/updates/authoring), `apps/console/src/settings/plugins.ts` (renders three plain rows for built-ins only)
- **Issue:** Same pattern as Appearance: the rendered pane undercuts the mockup. Tabs, filter search, "install from url", community/update badges, and the authoring block all vanish.
- **Impact:** Plugin-ability is a core selling point and the settings pane is where forkers will land. The mockup's "any plugin = a folder with schema + ui + commands" story is lost.
- **Recommendation:** Even if registry is v2, ship the Installed tab as the mockup renders it (icon, title, badge, version, kb + deps, toggle). The other tabs can be placeholder "coming in v2."

### [MEDIUM] Dark-mode contrast is improved but not audited
- **Location:** `console.css:19-33, 1589-1607`
- **Issue:** The prior feedback's contrast fixes landed for `.cmdbar` and `.modlist li.active`. Remaining likely-low-contrast spots in dark mode: (a) `.statusline .k` at `--muted:#6a8a6e` against `--paper-2:#161e18` is visually ~3.2:1 — borderline for small caps, below WCAG AA 4.5:1; (b) `.repl .out` uses `--muted` against `--paper-2` — same issue on the Home screen's main transcript; (c) `.hint` inside onboarding panels uses `--muted` on `--paper-2` left-border accent panels. The text-shadow phosphor glow (`text-shadow: 0 0 1px rgba(102,255,136,0.3)` on body) further reduces perceived contrast.
- **Impact:** Small monospace muted text is the workhorse of this UI. AA failure on it means large swaths of the app are hard to read for anyone not at full visual acuity.
- **Recommendation:** Bump `--muted` in dark mode to `#8ea593` or `#9cb6a1` (raises contrast against `--paper-2` past 4.5:1). Gate the phosphor `text-shadow` behind a user preference (already prepared as "crt overlay" — tie text-shadow to the crt setting rather than always-on).

### [LOW] Screen nav uses `data-scr` on both button and `[data-goto]`; also persists last screen as "boot"
- **Location:** `apps/console/src/shell/nav.ts:27-32`, `core-commands.ts:52-58`
- **Issue:** On app open after onboarding, `initNav` restores the last-saved screen from `localStorage.atlas1c-screen`. During onboarding, `showScreen("boot")` runs and writes `"boot"` to storage. On next launch the user lands on Boot again for a flicker before the onboarded gate redirects. Also, the screen-nav `boot` button is always visible in the header even after onboarding.
- **Impact:** Minor startup jank and a button that does something unexpected (replays onboarding chrome with stale content) when pressed by curious users.
- **Recommendation:** In `core-commands.ts:showScreen`, don't persist `"boot"`. Hide `button[data-scr="boot"]` once `config.onboarded` is true.

### [LOW] Nav spelling mismatch: `projects` button points to `ailab`
- **Location:** `index.html:24` (`<button data-scr="ailab">projects</button>`) vs `scr-ailab` section id (`:816`) vs `data-screen-label="Projects"` vs `scr-ailab` label `~/projects`
- **Issue:** The section is labeled "projects" everywhere except the internal id `ailab` / `scr-ailab`. The module is broader than AI lab. Left pane header says `~/projects`, title reads "agent-eval-v3", the filter tag includes non-AI (`weekend-synth` in Rust, dotfiles).
- **Impact:** `showScreen("projects")` from the command bar does not work — users have to type `/go ailab`, which isn't discoverable.
- **Recommendation:** Rename the screen id to `projects` (and update `data-scr`, `id`, `nav.ts`, `core-commands.ts`). Keep `ailab` as an alias if needed.

### [LOW] `index.html` is 1889 lines with large inline CSS in style attributes
- **Location:** nearly every section uses `style="..."` for one-off tweaks (font-size, color, margin, grid-template-columns)
- **Issue:** Hundreds of inline styles prevent theming overrides (a plugin or custom theme cannot, e.g., change all `font-size: 11px; color: var(--muted)` labels at once). They also make a11y maintenance (focus styling, color tokens) harder.
- **Impact:** Polish and future theming friction, not a user-blocker.
- **Recommendation:** Extract the common inline-styled patterns into utility classes (`.t-10`, `.t-muted`, `.col-2`, `.col-3`). Not urgent.

### [LOW] REPL transcript is decorative, not live
- **Location:** `index.html:157-181`, `apps/console/src/shell/cmdbar.ts`
- **Issue:** The Home-center REPL is a hard-coded pretend session. The real cmdbar lives at the bottom and nothing ever writes into the transcript. Users who see `atlas: brief me` → reply may assume they can type `brief me` in the cmdbar and get that output (they can't; `brief me` is not a command).
- **Impact:** Mild expectation mismatch on the most prominent screen.
- **Recommendation:** Either (a) make the transcript live (append `runtime.commands.invoke` results there), or (b) clearly frame it as a "sample session" sticky note / dashed border so users don't mistake it for history.

### [LOW] Empty states are honest but terse
- **Location:** `plugins/tasks/main.js:151` ("no tasks yet. try /tasks.add buy milk"), `plugins/journal/main.js:213` ("(no entries yet)" at 40% opacity), `plugins/habits/main.js:183` ("no habits configured yet.")
- **Issue:** The tasks message is great — actionable with a copy-pastable command. Journal and habits are passive, don't tell the user the next step, and journal uses `opacity: 0.4` which likely fails contrast.
- **Impact:** First-run drop-off risk on habits and journal panels.
- **Recommendation:** Match the tasks pattern for all three: `habits → no habits yet. try /habits.add meditate 1/d`, `journal → no entries yet. try /journal.new or press n to start today's entry`. Remove the 0.4 opacity, use `color: var(--muted)` instead.

### [LOW] ASCII banner uses box-drawing glyphs that may not render on Windows without JetBrains Mono
- **Location:** `index.html:90-94, 321-325`; font fallback is `'JetBrains Mono', 'Courier New', monospace`
- **Issue:** Courier New renders `╔═╗ ║ ╩` inconsistently on some Windows installs (glyphs present but wrong metrics → the `│ │` frame misaligns).
- **Impact:** Users on networks blocking Google Fonts see a slightly broken banner.
- **Recommendation:** Ship JetBrains Mono as a self-hosted `@font-face` (also avoids the privacy hit of Google Fonts per the product's "local-first" claim). Atlas is a Tauri app and currently loads fonts from the public internet on every launch — that contradicts the philosophy in Settings › About.

## Accessibility notes
- `index.html` contains **zero** `aria-*`, `role=`, `tabindex`, or `<label>` elements (verified via grep). For a keyboard-first product this is the top gap.
- No skip-link to the main content; `.screen.on` visibility is controlled with `display: none` (good — hides from AT), but landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`) are correctly used in markup — credit where due.
- `<input>` fields in onboarding and settings have placeholders but no `<label for=...>` or `aria-label`. `#bootName`, `#cmdIn`, tagline, operator handle, etc. all rely on visual proximity.
- `.cmdbar .in` has no `role="combobox"` / `aria-expanded` story — needed once autocomplete lands.
- `.blink` cursor element (`index.html:180, 358`) animates with `steps(2) infinite` — fine, but the CRT scanlines + blink combo has no `@media (prefers-reduced-motion: reduce)` override anywhere in the stylesheet. Add one that kills `@keyframes blink`, `.crt::after`, `.onb-panel.active` slide, `.now-box` progress animation, and toast slide.
- Color alone communicates state in several places: `.modlist li .dot.err` (orange dot) vs `.dot.on` (green) — colorblind users can't tell apart. Add text like `live / err / off` or glyph differentiation.
- `.sticky-note` at `background: var(--accent-3)` (`#f0c850`) with `color: #1a1a1a` is fine, but the rotated transform plus Caveat cursive font could be hostile to readers with cognitive / dyslexia support needs. Consider respecting `prefers-reduced-motion` to zero the rotation.
- `.badges .badge.locked` uses `?` as its only content and `font-family: JetBrains Mono` — screen readers will announce "question mark question mark question mark". Add `aria-label="locked badge"` or render an `<img alt="">`-style pattern.
- Statusline should be an `aria-live="polite"` region so HP/NRG/INBOX updates are announced.
- No focus trap in the onboarding modal-like flow — Tab from the last input escapes the panel into the hidden home screen's clickable elements.

## Polish ideas
- **Live boot-log.** The `[ok]` lines in the boot screen are hard-coded. Animate them in sequence (50ms each) on page load for a real "booting" feel — cheap and very on-brand.
- **Cursor continuity.** When the user types in the cmdbar, mirror their input at the bottom of the Home REPL transcript as if it's a live shell. Flip the decorative prompt `█` cursor to reflect actual focus state.
- **Class-card hover preview.** Hovering a `.class-card` in onboarding could dim the `.mod-chips` on step 3 underneath to show the seeded selection. Reinforces that choices are connected.
- **Quest completion toast.** The existing `.toast` keyframe is defined but unused — hook it to `/tasks.complete` and similar actions with `+N xp` copy. Highest-leverage delight moment.
- **Statusline as context.** On the Settings screen the statusline still shows HP/NRG/FOCUS, which feels off. Swap it to "config: ~/atlas-1/config.json · 6 sections · last saved 2s ago" when on the settings screen.
- **Plugin registry empty state.** The onboarding step 3 registry preview is beautifully rendered but currently decorative. If the real registry is v2, make step 3's "+ browse plugin registry →" button show a "coming soon — ship with the official 3 for now" panel instead of the fake list.
- **Screen transitions.** `.screen { display: none }` switching is instant. A 120ms fade or the existing `onb-slide` keyframe would reinforce "CRT channel change" without being distracting. Gate behind prefers-reduced-motion.
- **Unify the tweaks panel & Appearance settings.** The bottom-right `.tweaks` popover exposes the same knobs as Settings › Appearance. Consider having tweaks surface "→ open in settings" once the settings renderer matches the mockup (fewer redundant systems to maintain).
- **Light mode phosphor.** Dark mode gets scanlines and glow; light mode ("paper") could get a subtle paper grain texture (SVG data-URL noise at 3-5% opacity) to carry the tactile metaphor.

## Not reviewed
- Actual **runtime behavior** of any interaction (the app was not launched). All findings are read from HTML, CSS, and TS source.
- **Animation performance** of scanlines/blink on low-end Windows GPUs.
- **Dark mode in practice** — I assessed color contrast from CSS variables only, not a screenshot.
- **Font loading / FOUT** behavior (Caveat + JetBrains Mono both load from fonts.googleapis.com; no self-hosted fallback).
- **Windowing / Tauri edges** — the in-webview UI, not the OS window chrome, tray, or minimize/close flows.
- **Actual keyboard shortcut registration** on Windows/macOS/Linux; only the source was inspected.
- **Tauri global-shortcut collision** with Windows default `Ctrl+Shift+Space` (which is bound to IME language switch on some Windows setups) — real behavior would need testing.
- **Screen-reader announcements** with NVDA/JAWS/VoiceOver — only the markup was audited.
- **Plugin views (tasks/journal/habits)** were only grepped for empty states; the rendered layouts were not read end-to-end.
