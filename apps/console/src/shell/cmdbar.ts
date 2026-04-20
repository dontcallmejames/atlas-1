import type { Runtime } from "@atlas/core";
import { parseCommand } from "@atlas/core";

const HISTORY_MAX = 50;
const SUGG_MAX = 8;
const ERROR_TIMEOUT_MS = 4000;

/**
 * Pure history ring-buffer helper (exported for tests).
 */
export interface HistoryState {
  items: string[];
  idx: number | null;
}

export function createHistory(): HistoryState {
  return { items: [], idx: null };
}

export function pushHistory(state: HistoryState, entry: string): HistoryState {
  const trimmed = entry.trim();
  if (!trimmed) return { items: state.items, idx: null };
  const items = state.items.slice();
  // dedupe trailing duplicate
  if (items[items.length - 1] !== trimmed) {
    items.push(trimmed);
    if (items.length > HISTORY_MAX) items.shift();
  }
  return { items, idx: null };
}

export function cycleUp(state: HistoryState): { state: HistoryState; value: string | null } {
  if (state.items.length === 0) return { state, value: null };
  const idx =
    state.idx === null ? state.items.length - 1 : Math.max(0, state.idx - 1);
  return { state: { ...state, idx }, value: state.items[idx] ?? null };
}

export function cycleDown(state: HistoryState): { state: HistoryState; value: string | null } {
  if (state.idx === null) return { state, value: null };
  const next = state.idx + 1;
  if (next >= state.items.length) {
    return { state: { ...state, idx: null }, value: "" };
  }
  return { state: { ...state, idx: next }, value: state.items[next] ?? null };
}

/**
 * Wire the bottom `.cmdbar` input:
 * - pressing "/" from anywhere (except while typing in another input) focuses it
 * - Enter parses + invokes via runtime.commands
 * - typing shows an autocomplete dropdown filtered on runtime.commands.list()
 * - unknown commands render an inline error pill
 * - ArrowUp/ArrowDown cycles through submit history
 * - Escape closes dropdown or blurs the input
 */
export function initCmdbar(runtime: Runtime): () => void {
  const input = document.querySelector<HTMLInputElement>(".cmdbar .in");
  const bar = document.querySelector<HTMLElement>(".cmdbar");
  if (!input || !bar) return () => {};

  // Ensure cmdbar is a positioned anchor for absolute children
  if (getComputedStyle(bar).position === "static") {
    bar.style.position = "fixed";
  }

  // Suggestions dropdown
  const sugg = document.createElement("div");
  sugg.className = "cmd-sugg";
  sugg.hidden = true;
  bar.appendChild(sugg);

  // Error pill
  const errEl = document.createElement("div");
  errEl.className = "cmd-err";
  errEl.hidden = true;
  bar.appendChild(errEl);

  let history: HistoryState = createHistory();
  let matches: Array<{ id: string; hint?: string }> = [];
  let activeIdx = -1;
  let errTimer: ReturnType<typeof setTimeout> | null = null;

  const hideSugg = (): void => {
    sugg.hidden = true;
    sugg.innerHTML = "";
    matches = [];
    activeIdx = -1;
  };

  const renderSugg = (): void => {
    sugg.innerHTML = "";
    if (matches.length === 0) {
      sugg.hidden = true;
      return;
    }
    matches.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "cmd-sugg-row" + (i === activeIdx ? " active" : "");
      const id = document.createElement("span");
      id.className = "cmd-sugg-id";
      id.textContent = "/" + c.id;
      row.appendChild(id);
      if (c.hint) {
        const hint = document.createElement("span");
        hint.className = "cmd-sugg-title";
        hint.textContent = " — " + c.hint;
        row.appendChild(hint);
      }
      row.addEventListener("mousedown", (e) => {
        // mousedown (not click) so input doesn't blur first
        e.preventDefault();
        input.value = "/" + c.id;
        hideSugg();
        input.focus();
      });
      sugg.appendChild(row);
    });
    sugg.hidden = false;
  };

  const updateSugg = (): void => {
    const raw = input.value;
    const query = raw.trim().replace(/^\//, "").toLowerCase();
    if (!query) {
      hideSugg();
      return;
    }
    const all = runtime.commands.list();
    matches = all
      .filter((c) => c.id.toLowerCase().includes(query))
      // startsWith matches rank ahead of substring
      .sort((a, b) => {
        const as = a.id.toLowerCase().startsWith(query) ? 0 : 1;
        const bs = b.id.toLowerCase().startsWith(query) ? 0 : 1;
        if (as !== bs) return as - bs;
        return a.id.localeCompare(b.id);
      })
      .slice(0, SUGG_MAX);
    activeIdx = matches.length > 0 ? 0 : -1;
    renderSugg();
  };

  const showError = (msg: string): void => {
    errEl.textContent = msg;
    errEl.hidden = false;
    if (errTimer) clearTimeout(errTimer);
    errTimer = setTimeout(() => {
      errEl.hidden = true;
    }, ERROR_TIMEOUT_MS);
  };

  const hideError = (): void => {
    if (errTimer) clearTimeout(errTimer);
    errTimer = null;
    errEl.hidden = true;
  };

  const onGlobalKey = (e: KeyboardEvent): void => {
    if (e.key !== "/") return;
    const target = e.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
    e.preventDefault();
    input.focus();
  };

  const onInput = (): void => {
    hideError();
    updateSugg();
  };

  const onKey = async (e: KeyboardEvent): Promise<void> => {
    if (e.key === "Escape") {
      if (!sugg.hidden) {
        hideSugg();
        return;
      }
      input.blur();
      return;
    }

    if (e.key === "ArrowDown") {
      if (!sugg.hidden && matches.length > 0) {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % matches.length;
        renderSugg();
        return;
      }
      // history down
      const { state, value } = cycleDown(history);
      history = state;
      if (value !== null) {
        e.preventDefault();
        input.value = value;
      }
      return;
    }

    if (e.key === "ArrowUp") {
      if (!sugg.hidden && matches.length > 0) {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + matches.length) % matches.length;
        renderSugg();
        return;
      }
      const { state, value } = cycleUp(history);
      history = state;
      if (value !== null) {
        e.preventDefault();
        input.value = value;
      }
      return;
    }

    if (e.key !== "Enter") return;

    // If dropdown is open and a row is active, use that command id
    const active = !sugg.hidden && activeIdx >= 0 ? matches[activeIdx] : undefined;
    if (active) {
      input.value = "/" + active.id;
      hideSugg();
    }

    const raw = input.value.trim();
    if (!raw) return;
    const parsed = parseCommand(raw);
    if (!parsed.id || !runtime.commands.has(parsed.id)) {
      showError(`✗ unknown command: ${raw} — type /help to list`);
      return;
    }

    // Success path: record history and clear input
    history = pushHistory(history, raw);
    input.value = "";
    hideSugg();
    hideError();

    try {
      await runtime.commands.invoke(parsed.id, parsed.args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(`✗ ${msg}`);
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const onBlur = (): void => {
    // small delay so mousedown on a row can fire first
    setTimeout(() => hideSugg(), 120);
  };

  document.addEventListener("keydown", onGlobalKey);
  input.addEventListener("keydown", onKey as unknown as (e: Event) => void);
  input.addEventListener("input", onInput);
  input.addEventListener("blur", onBlur);

  return () => {
    document.removeEventListener("keydown", onGlobalKey);
    input.removeEventListener("keydown", onKey as unknown as (e: Event) => void);
    input.removeEventListener("input", onInput);
    input.removeEventListener("blur", onBlur);
    if (errTimer) clearTimeout(errTimer);
    sugg.remove();
    errEl.remove();
  };
}
