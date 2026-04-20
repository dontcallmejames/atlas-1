import type { Runtime } from "@atlas/core";
import { loadPluginState, setPluginEnabled } from "@atlas/core";

/**
 * Known built-in plugin ids. In v1 this list is static — the webview
 * bundles three built-ins via import.meta.glob. Third-party plugins would
 * extend this via the runtime; that's v2.
 */
const BUILT_IN_IDS = ["tasks", "journal", "habits"];

const BUILT_IN_META: Record<string, { name: string; description: string }> = {
  tasks: { name: "Tasks", description: "Minimal GFM task list backed by inbox.md." },
  journal: { name: "Journal", description: "Daily Markdown notes with autosave." },
  habits: { name: "Habits", description: "YAML-defined habits + heatmap." },
};

export function renderPlugins(el: HTMLElement, runtime: Runtime): void {
  void render(el, runtime);
}

async function render(el: HTMLElement, runtime: Runtime): Promise<void> {
  const state = await loadPluginState(runtime.vault);
  const disabled = new Set(
    state.plugins.filter((p) => p.enabled === false).map((p) => p.id),
  );

  el.innerHTML = "";
  const header = document.createElement("div");
  header.className = "set-sec-hdr";
  header.innerHTML =
    '<div class="set-sec-title">plugins</div>' +
    '<div class="set-sec-sub">built-in modules shipped with atlas. toggle to enable or disable. restart to take effect.</div>';
  el.appendChild(header);

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "12px";
  list.style.marginTop = "16px";

  for (const id of BUILT_IN_IDS) {
    const row = document.createElement("div");
    row.className = "set-row";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "16px";
    row.style.padding = "12px";
    row.style.border = "1px solid var(--line)";

    const info = document.createElement("div");
    info.style.flex = "1";
    const name = document.createElement("div");
    name.style.fontWeight = "600";
    name.textContent = BUILT_IN_META[id]?.name ?? id;
    const desc = document.createElement("div");
    desc.style.fontSize = "11px";
    desc.style.opacity = "0.6";
    desc.textContent = BUILT_IN_META[id]?.description ?? "";
    const meta = document.createElement("div");
    meta.style.fontSize = "10px";
    meta.style.opacity = "0.4";
    meta.style.marginTop = "4px";
    meta.textContent = `id: ${id} · built-in`;
    info.appendChild(name);
    info.appendChild(desc);
    info.appendChild(meta);
    row.appendChild(info);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = !disabled.has(id);
    const notice = document.createElement("div");
    notice.style.fontSize = "10px";
    notice.style.opacity = "0.6";
    notice.style.marginLeft = "8px";
    notice.style.minWidth = "90px";
    toggle.addEventListener("change", async () => {
      await setPluginEnabled(runtime.vault, id, toggle.checked);
      notice.textContent = "restart to apply";
      notice.style.color = "var(--accent)";
    });
    row.appendChild(toggle);
    row.appendChild(notice);

    list.appendChild(row);
  }

  el.appendChild(list);
}
