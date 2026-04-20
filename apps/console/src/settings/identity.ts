import type { Runtime } from "@atlas/core";

/**
 * Render the identity section. Replaces `el.innerHTML` with a form bound
 * to `runtime.config`. Fields: name, tagline, operator.
 */
export function renderIdentity(el: HTMLElement, runtime: Runtime): void {
  const c = runtime.config.get();

  el.innerHTML = "";
  const header = document.createElement("div");
  header.className = "set-sec-hdr";
  header.innerHTML =
    '<div class="set-sec-title">identity</div>' +
    '<div class="set-sec-sub">name, operator, and tagline.</div>';
  el.appendChild(header);

  el.appendChild(makeRow("console name", makeInput(c.name, { placeholder: "Atlas 1", width: "260px" }, (v) => {
    runtime.config.update({ name: v });
    void runtime.config.save();
  })));

  el.appendChild(makeRow("tagline", makeInput(c.tagline, { placeholder: "life console", width: "100%" }, (v) => {
    runtime.config.update({ tagline: v });
    void runtime.config.save();
  })));

  el.appendChild(makeRow("operator class", makeInput(c.operator, { placeholder: "handle", width: "220px" }, (v) => {
    runtime.config.update({ operator: v });
    void runtime.config.save();
  })));

  el.appendChild(makeRow("your name", makeInput(c.operatorName, { placeholder: "used in greetings", width: "220px" }, (v) => {
    runtime.config.update({ operatorName: v.trim() });
    void runtime.config.save();
  })));
}

function makeRow(label: string, valueNode: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "set-row";
  const k = document.createElement("div");
  k.className = "set-k";
  k.textContent = label;
  const v = document.createElement("div");
  v.className = "set-v";
  v.appendChild(valueNode);
  row.appendChild(k);
  row.appendChild(v);
  return row;
}

function makeInput(
  value: string,
  opts: { placeholder?: string; width?: string },
  onChange: (value: string) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "set-input";
  input.value = value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.width) input.style.width = opts.width;
  let t: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("input", () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => onChange(input.value), 250);
  });
  input.addEventListener("blur", () => {
    if (t) {
      clearTimeout(t);
      t = undefined;
    }
    onChange(input.value);
  });
  return input;
}
