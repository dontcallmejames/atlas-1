import type { Runtime } from "@atlas/core";

/** Wire nav buttons + any `[data-goto]` element to the `go` command. */
export function initNav(runtime: Runtime): () => void {
  const handlers: Array<{ el: Element; h: EventListener }> = [];

  const buttons = document.querySelectorAll<HTMLButtonElement>("#screenNav button[data-scr]");
  buttons.forEach((btn) => {
    const h: EventListener = () => {
      const target = btn.dataset.scr ?? "home";
      void runtime.commands.invoke("go", [target]);
    };
    btn.addEventListener("click", h);
    handlers.push({ el: btn, h });
  });

  document.querySelectorAll<HTMLElement>("[data-goto]").forEach((el) => {
    const h: EventListener = () => {
      const target = el.dataset.goto;
      if (target) void runtime.commands.invoke("go", [target]);
    };
    el.addEventListener("click", h);
    handlers.push({ el, h });
  });

  // Restore last screen if any.
  try {
    const saved = localStorage.getItem("atlas1c-screen");
    if (saved) void runtime.commands.invoke("go", [saved]);
  } catch {
    // ignore
  }

  return () => {
    handlers.forEach(({ el, h }) => el.removeEventListener("click", h));
  };
}
