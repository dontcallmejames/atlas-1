import type { Runtime } from "@atlas/core";

/**
 * Render the appearance section. Replaces the static HTML with form fields
 * bound to runtime.config (theme, accent, density, crt, gameMode).
 */
export function renderAppearance(el: HTMLElement, runtime: Runtime): void {
  el.innerHTML = "";
  const header = document.createElement("div");
  header.className = "set-sec-hdr";
  header.innerHTML =
    '<div class="set-sec-title">appearance</div>' +
    '<div class="set-sec-sub">theme, accent, density, CRT. Persisted to .atlas/config.json.</div>';
  el.appendChild(header);

  el.appendChild(makeRow("theme", makeSelect(["light", "dark"], runtime.config.get().theme, (v) => {
    if (v === "light" || v === "dark") {
      runtime.config.update({ theme: v });
      void runtime.config.save();
    }
  })));

  el.appendChild(makeRow("accent", makeAccentPicker(runtime)));

  el.appendChild(makeRow("density", makeSelect(["comfy", "compact"], runtime.config.get().density, (v) => {
    if (v === "comfy" || v === "compact") {
      runtime.config.update({ density: v });
      void runtime.config.save();
    }
  })));

  el.appendChild(makeRow("CRT overlay", makeCheckbox(runtime.config.get().crt, (v) => {
    runtime.config.update({ crt: v });
    void runtime.config.save();
  })));

  el.appendChild(makeRow("game mode (XP/level/streak)", makeCheckbox(runtime.config.get().gameMode, (v) => {
    runtime.config.update({ gameMode: v });
    void runtime.config.save();
  })));
}

function makeRow(label: string, value: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "set-row";
  const k = document.createElement("div");
  k.className = "set-k";
  k.textContent = label;
  const v = document.createElement("div");
  v.className = "set-v";
  v.appendChild(value);
  row.appendChild(k);
  row.appendChild(v);
  return row;
}

function makeSelect(options: string[], current: string, onChange: (v: string) => void): HTMLElement {
  const sel = document.createElement("select");
  sel.className = "set-input";
  sel.style.width = "160px";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    if (o === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function makeCheckbox(current: boolean, onChange: (v: boolean) => void): HTMLElement {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = current;
  box.addEventListener("change", () => onChange(box.checked));
  return box;
}

const ACCENT_SWATCHES = ["#e85d3d", "#3d7ae8", "#f0c850", "#2d7a3d", "#9e6bc9"];

function makeAccentPicker(runtime: Runtime): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "8px";
  const current = runtime.config.get().accent;
  for (const hex of ACCENT_SWATCHES) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.style.width = "28px";
    sw.style.height = "28px";
    sw.style.background = hex;
    sw.style.border = "2px solid " + (hex === current ? "var(--ink)" : "transparent");
    sw.style.cursor = "pointer";
    sw.title = hex;
    sw.addEventListener("click", () => {
      runtime.config.update({ accent: hex });
      void runtime.config.save();
      wrap.querySelectorAll<HTMLElement>("button").forEach((b) => {
        b.style.border = "2px solid " + (b.title === hex ? "var(--ink)" : "transparent");
      });
    });
    wrap.appendChild(sw);
  }
  const custom = document.createElement("input");
  custom.type = "text";
  custom.className = "set-input";
  custom.style.width = "100px";
  custom.value = current;
  custom.placeholder = "#rrggbb";
  custom.addEventListener("change", () => {
    if (/^#[0-9a-fA-F]{6}$/.test(custom.value)) {
      runtime.config.update({ accent: custom.value });
      void runtime.config.save();
    }
  });
  wrap.appendChild(custom);
  return wrap;
}
