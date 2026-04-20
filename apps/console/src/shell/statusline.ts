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
