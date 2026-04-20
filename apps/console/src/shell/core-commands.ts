import type { Runtime } from "@atlas/core";

export function registerCoreCommands(runtime: Runtime): void {
  runtime.commands.register({ id: "go", hint: "/go <screen>", run: (args) => {
    const t = args[0];
    if (t) showScreen(t);
  }});
  runtime.commands.register({ id: "theme", hint: "/theme <light|dark>", run: (args) => {
    const m = args[0];
    if (m === "light" || m === "dark") { runtime.config.update({ theme: m }); void runtime.config.save(); }
  }});
  runtime.commands.register({ id: "crt", hint: "/crt <on|off>", run: (args) => {
    const v = args[0];
    const next = v === "on" ? true : v === "off" ? false : !runtime.config.get().crt;
    runtime.config.update({ crt: next }); void runtime.config.save();
  }});
  runtime.commands.register({ id: "density", hint: "/density <comfy|compact>", run: (args) => {
    const v = args[0];
    if (v === "comfy" || v === "compact") { runtime.config.update({ density: v }); void runtime.config.save(); }
  }});
  runtime.commands.register({ id: "accent", hint: "/accent <#rrggbb>", run: (args) => {
    const hex = args[0];
    if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) { runtime.config.update({ accent: hex }); void runtime.config.save(); }
  }});
  runtime.commands.register({ id: "settings", hint: "/settings", run: () => showScreen("settings") });
  runtime.commands.register({ id: "help", hint: "/help", run: () => {
    const list = runtime.commands.list();
    // eslint-disable-next-line no-console
    console.log("commands:\n" + list.map((c) => `  ${c.hint ?? c.id}`).join("\n"));
  }});
  runtime.commands.register({ id: "?", hint: "/?", run: () => runtime.commands.invoke("help") });
}

export function showScreen(id: string): void {
  const screens = document.querySelectorAll<HTMLElement>(".screen");
  screens.forEach((s) => s.classList.toggle("on", s.id === `scr-${id}`));
  document.querySelectorAll<HTMLButtonElement>("#screenNav button").forEach((b) => {
    b.classList.toggle("on", b.dataset.scr === id);
  });
  try { localStorage.setItem("atlas1c-screen", id); } catch { /* ignore */ }
}
