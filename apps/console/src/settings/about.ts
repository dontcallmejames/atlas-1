import type { Runtime } from "@atlas/core";

const VERSION = "0.1.0";
const REPO_URL = "https://github.com/dontcallmejames/atlas-1";

export function renderAbout(el: HTMLElement, runtime: Runtime): void {
  void render(el, runtime);
}

async function render(el: HTMLElement, runtime: Runtime): Promise<void> {
  el.innerHTML = "";
  const header = document.createElement("div");
  header.className = "set-sec-hdr";
  header.innerHTML =
    '<div class="set-sec-title">about</div>' +
    '<div class="set-sec-sub">the console, its data, and its source.</div>';
  el.appendChild(header);

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "160px 1fr";
  grid.style.gap = "12px 20px";
  grid.style.marginTop = "16px";
  grid.style.fontSize = "13px";

  const xp = runtime.xp.getState();
  const navCount = runtime.mounts.listNavs().length;
  const ritualCount = runtime.rituals.listRituals().length;
  const cmdCount = runtime.commands.list().length;
  const vaultPath = runtime.config.get().vaultPath || "(set at onboarding)";

  addRow(grid, "version", VERSION);
  addRow(grid, "license", "MIT");
  addRow(grid, "vault path", vaultPath);
  addRow(grid, "plugins loaded", String(navCount));
  addRow(grid, "rituals loaded", String(ritualCount));
  addRow(grid, "commands registered", String(cmdCount));
  addRow(grid, "xp total", `${xp.xp} · lvl ${xp.lvl}`);
  addRow(grid, "repo", makeLink(REPO_URL, REPO_URL));

  el.appendChild(grid);

  const philo = document.createElement("div");
  philo.style.marginTop = "24px";
  philo.style.fontSize = "12px";
  philo.style.opacity = "0.7";
  philo.style.lineHeight = "1.6";
  philo.textContent =
    "atlas is local-first. your data lives in a plain-text vault on your machine. every module is a plugin that uses the same public SDK forkers use. if you do not like something, the source is right there.";
  el.appendChild(philo);
}

function addRow(grid: HTMLElement, key: string, value: string | HTMLElement): void {
  const k = document.createElement("div");
  k.style.opacity = "0.6";
  k.textContent = key;
  const v = document.createElement("div");
  if (typeof value === "string") v.textContent = value;
  else v.appendChild(value);
  grid.appendChild(k);
  grid.appendChild(v);
}

function makeLink(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noopener";
  a.style.color = "var(--accent)";
  return a;
}
