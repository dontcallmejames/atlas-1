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
    if (brand) brand.textContent = c.name.toUpperCase().replace(/\s+/g, "\u00B7");
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
