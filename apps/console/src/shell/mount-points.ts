import type { Runtime, NavItem, ScreenView } from "@atlas/core";

/**
 * Reflect `runtime.mounts` into the DOM:
 *  - one `<button data-scr="<id>">` per NavItem, inserted into `#screenNav`
 *  - one `<section class="screen" id="scr-<id>">` per ScreenView, inserted
 *    into `#plugin-screens`; the plugin's loader is awaited on first activation
 *    and its returned module's `render(el)` fn populates the section.
 */
export function initMountPoints(runtime: Runtime): () => void {
  const navRoot = document.getElementById("screenNav");
  const screensRoot = document.getElementById("plugin-screens");
  if (!navRoot || !screensRoot) return () => {};

  const loadedViews = new Set<string>();
  const navButtons = new Map<string, HTMLButtonElement>();
  const sections = new Map<string, HTMLElement>();

  const observer = new MutationObserver(async (mutations) => {
    for (const m of mutations) {
      if (m.type !== "attributes" || m.attributeName !== "class") continue;
      const target = m.target as HTMLElement;
      if (!target.id.startsWith("scr-")) continue;
      if (!target.classList.contains("on")) continue;
      const screenId = target.id.slice("scr-".length);
      if (loadedViews.has(screenId)) continue;
      const view = runtime.mounts.getView(screenId);
      if (!view) continue;
      loadedViews.add(screenId);
      try {
        const mod = await view.loader();
        const render = (mod as { render?: (el: HTMLElement) => void }).render;
        if (typeof render === "function") render(target);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`failed to load view "${screenId}":`, err);
      }
    }
  });

  const observeSection = (section: HTMLElement): void => {
    observer.observe(section, { attributes: true, attributeFilter: ["class"] });
  };

  const renderNavs = (items: NavItem[]): void => {
    const desired = new Set(items.map((i) => i.id));
    for (const [id, btn] of navButtons) {
      if (!desired.has(id)) {
        btn.remove();
        navButtons.delete(id);
      }
    }
    for (const item of items) {
      if (navButtons.has(item.id)) continue;
      const btn = document.createElement("button");
      btn.dataset.scr = item.id;
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        void runtime.commands.invoke("go", [item.id]);
      });
      navRoot.appendChild(btn);
      navButtons.set(item.id, btn);
    }
  };

  const renderViews = (views: ScreenView[]): void => {
    const desired = new Set(views.map((v) => v.screenId));
    for (const [id, section] of sections) {
      if (!desired.has(id)) {
        section.remove();
        sections.delete(id);
        loadedViews.delete(id);
      }
    }
    for (const view of views) {
      if (sections.has(view.screenId)) continue;
      const section = document.createElement("section");
      section.className = "screen";
      section.id = `scr-${view.screenId}`;
      screensRoot.appendChild(section);
      sections.set(view.screenId, section);
      observeSection(section);
    }
  };

  renderNavs(runtime.mounts.listNavs());
  renderViews(runtime.mounts.listViews());
  const offNavs = runtime.mounts.onNavsChange(renderNavs);
  const offViews = runtime.mounts.onViewsChange(renderViews);

  return () => {
    offNavs();
    offViews();
    observer.disconnect();
  };
}
