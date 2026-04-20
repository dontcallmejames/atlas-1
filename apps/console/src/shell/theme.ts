import type { Runtime } from "@atlas/core";

/**
 * Apply the current config theme + CRT state to the DOM, and keep them
 * in sync when config changes. Also wires the `#themeBtn` and `#crtBtn`
 * toggles so user clicks update the config store.
 */
export function initTheme(runtime: Runtime): () => void {
  const apply = (): void => {
    const c = runtime.config.get();
    document.documentElement.setAttribute("data-theme", c.theme);
    document.body.classList.toggle("crt", c.crt);
    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.textContent = `theme: ${c.theme}`;
    const crtBtn = document.getElementById("crtBtn");
    if (crtBtn) crtBtn.classList.toggle("on", c.crt);
  };
  apply();

  const offConfig = runtime.config.subscribe(apply);

  const themeBtn = document.getElementById("themeBtn");
  const onTheme = (): void => {
    const next = runtime.config.get().theme === "light" ? "dark" : "light";
    runtime.config.update({ theme: next });
    void runtime.config.save();
  };
  themeBtn?.addEventListener("click", onTheme);

  const crtBtn = document.getElementById("crtBtn");
  const onCrt = (): void => {
    const next = !runtime.config.get().crt;
    runtime.config.update({ crt: next });
    void runtime.config.save();
  };
  crtBtn?.addEventListener("click", onCrt);

  return () => {
    offConfig();
    themeBtn?.removeEventListener("click", onTheme);
    crtBtn?.removeEventListener("click", onCrt);
  };
}
