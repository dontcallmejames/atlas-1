import type { Runtime } from "@atlas/core";

export function registerCoreCommands(runtime: Runtime): void {
  runtime.commands.register({
    id: "go",
    hint: "/go <screen>",
    run: (args) => {
      const target = args[0];
      if (!target) return;
      showScreen(target);
    },
  });
}

/**
 * Swap the `.on` class between `.screen` sections. Matches the prototype's
 * `#scr-<id>` id scheme and the nav buttons' `data-scr="<id>"`.
 */
export function showScreen(id: string): void {
  const screens = document.querySelectorAll<HTMLElement>(".screen");
  screens.forEach((s) => s.classList.toggle("on", s.id === `scr-${id}`));
  document.querySelectorAll<HTMLButtonElement>("#screenNav button").forEach((b) => {
    b.classList.toggle("on", b.dataset.scr === id);
  });
  try {
    localStorage.setItem("atlas1c-screen", id);
  } catch {
    // ignore
  }
}
