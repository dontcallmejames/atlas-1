import type { Runtime } from "@atlas/core";

/**
 * Wire the floating tweaks panel (#tweaksPanel) to the ConfigStore.
 *
 * Panel controls (HTML in apps/console/index.html):
 *  - #tw-name                 instance name input
 *  - #tw-operator             operator (person) name input
 *  - button[data-theme]       theme toggle (light | dark)
 *  - button[data-accent]      accent color swatches
 *  - button[data-crt]         CRT scanlines (on | off)
 *  - button[data-game]        game layer (on | off)
 *
 * The trigger is the #tweakBtn chip in the top chrome. The panel shows when
 * #tweaksPanel has the `on` class (see .tweaks.on in console.css).
 */
export function initTweaks(runtime: Runtime): () => void {
  const panel = document.getElementById("tweaksPanel");
  const trigger = document.getElementById("tweakBtn");
  if (!panel || !trigger) return () => {};

  const togglePanel = (): void => {
    panel.classList.toggle("on");
  };
  trigger.addEventListener("click", togglePanel);

  const nameInput = document.getElementById("tw-name") as HTMLInputElement | null;
  const operatorInput = document.getElementById("tw-operator") as HTMLInputElement | null;
  const themeBtns = panel.querySelectorAll<HTMLButtonElement>("button[data-theme]");
  const accentBtns = panel.querySelectorAll<HTMLButtonElement>("button[data-accent]");
  const crtBtns = panel.querySelectorAll<HTMLButtonElement>("button[data-crt]");
  const gameBtns = panel.querySelectorAll<HTMLButtonElement>("button[data-game]");

  // Pull current state into the panel so .on reflects reality.
  const applyFromConfig = (): void => {
    const c = runtime.config.get();
    if (nameInput && document.activeElement !== nameInput) nameInput.value = c.name;
    if (operatorInput && document.activeElement !== operatorInput) operatorInput.value = c.operatorName;
    document.documentElement.style.setProperty("--accent", c.accent);

    themeBtns.forEach((b) => b.classList.toggle("on", b.dataset.theme === c.theme));
    accentBtns.forEach((b) => b.classList.toggle("on", b.dataset.accent === c.accent));
    crtBtns.forEach((b) => b.classList.toggle("on", (b.dataset.crt === "on") === c.crt));
    gameBtns.forEach((b) => b.classList.toggle("on", (b.dataset.game === "on") === c.gameMode));

    // Update the brand mark with the ASCII bracket treatment.
    const brand = document.getElementById("brandMark");
    if (brand) {
      const label = c.name.toUpperCase().replace(/\s+/g, "\u00B7");
      brand.textContent = `\u250C ${label} \u2510`;
    }
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
  if (operatorInput) {
    const h: EventListener = () => saveAnd({ operatorName: operatorInput.value.trim() });
    operatorInput.addEventListener("input", h);
    handlers.push({ el: operatorInput, type: "input", h });
  }
  themeBtns.forEach((btn) => {
    const h: EventListener = () => {
      const v = btn.dataset.theme;
      if (v === "light" || v === "dark") saveAnd({ theme: v });
    };
    btn.addEventListener("click", h);
    handlers.push({ el: btn, type: "click", h });
  });
  accentBtns.forEach((btn) => {
    const h: EventListener = () => {
      const v = btn.dataset.accent;
      if (v) saveAnd({ accent: v });
    };
    btn.addEventListener("click", h);
    handlers.push({ el: btn, type: "click", h });
  });
  crtBtns.forEach((btn) => {
    const h: EventListener = () => saveAnd({ crt: btn.dataset.crt === "on" });
    btn.addEventListener("click", h);
    handlers.push({ el: btn, type: "click", h });
  });
  gameBtns.forEach((btn) => {
    const h: EventListener = () => saveAnd({ gameMode: btn.dataset.game === "on" });
    btn.addEventListener("click", h);
    handlers.push({ el: btn, type: "click", h });
  });

  return () => {
    trigger.removeEventListener("click", togglePanel);
    offConfig();
    handlers.forEach(({ el, type, h }) => el.removeEventListener(type, h));
  };
}
