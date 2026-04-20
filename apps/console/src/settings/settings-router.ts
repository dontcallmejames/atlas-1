import type { Runtime } from "@atlas/core";
import { renderIdentity } from "./identity.js";
import { renderAppearance } from "./appearance.js";
import { renderPlugins } from "./plugins.js";
import { renderKeybindings } from "./keybindings.js";
import { renderAbout } from "./about.js";

type Renderer = (el: HTMLElement, runtime: Runtime) => void;

const RENDERERS: Record<string, Renderer> = {
  identity: renderIdentity,
  appearance: renderAppearance,
  plugins: renderPlugins,
  keys: renderKeybindings,
  about: renderAbout,
};

/**
 * Wire the settings screen:
 *  - `.sn-btn[data-sec]` left-rail buttons switch sections
 *  - each `.set-sec[data-sec]` has its inner content replaced by the matching
 *    renderer, which binds form fields to the runtime.
 */
export function initSettings(runtime: Runtime): () => void {
  const root = document.getElementById("scr-settings");
  if (!root) return () => {};

  const buttons = root.querySelectorAll<HTMLButtonElement>(".sn-btn[data-sec]");
  const sections = root.querySelectorAll<HTMLElement>(".set-sec[data-sec]");

  // Re-render every section once so all forms are populated from the current
  // runtime state. The hidden ones are just display:none.
  for (const sec of sections) {
    const key = sec.dataset.sec ?? "";
    const renderer = RENDERERS[key];
    if (renderer) renderer(sec, runtime);
  }

  const show = (key: string): void => {
    buttons.forEach((b) => b.classList.toggle("on", b.dataset.sec === key));
    sections.forEach((s) => s.classList.toggle("active", s.dataset.sec === key));
  };

  const onClick = (e: Event): void => {
    const btn = e.currentTarget as HTMLButtonElement;
    const key = btn.dataset.sec;
    if (key) show(key);
  };

  buttons.forEach((btn) => btn.addEventListener("click", onClick));

  return () => {
    buttons.forEach((btn) => btn.removeEventListener("click", onClick));
  };
}
