import type { Runtime } from "@atlas/core";
import { showScreen } from "./core-commands.js";

/**
 * Render a dynamic greeting on the Home screen, and wire the header brand
 * mark to jump back to Home.
 *
 * Replaces the static "good morning, alex" with one that reflects the actual
 * operator name (from config) and the current hour. Re-renders when the
 * config changes (e.g., user updates their name in settings/tweaks).
 */
export function initHomeGreeting(runtime: Runtime): () => void {
  const el = document.querySelector<HTMLElement>(".greet-line .hand");
  const brand = document.getElementById("brandMark");

  const goHome = (e: Event): void => {
    e.preventDefault();
    showScreen("home");
  };
  brand?.addEventListener("click", goHome);

  if (!el) {
    return () => { brand?.removeEventListener("click", goHome); };
  }

  const render = (): void => {
    const c = runtime.config.get();
    const name = (c.operatorName || "operator").trim() || "operator";
    el.textContent = `${timeOfDayGreeting(new Date())}, ${name}.`;
  };

  render();
  const off = runtime.config.subscribe(render);
  // Update mid-session at the next-hour boundary so a user who crossed noon
  // sees "good afternoon" without reloading.
  const interval = window.setInterval(render, 60_000);

  return () => {
    off();
    window.clearInterval(interval);
    brand?.removeEventListener("click", goHome);
  };
}

function timeOfDayGreeting(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "good morning";
  if (h >= 12 && h < 17) return "good afternoon";
  if (h >= 17 && h < 22) return "good evening";
  return "good night";
}
