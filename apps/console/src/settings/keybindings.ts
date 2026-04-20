import type { Runtime } from "@atlas/core";

export function renderKeybindings(el: HTMLElement, runtime: Runtime): void {
  el.innerHTML = "";
  const header = document.createElement("div");
  header.className = "set-sec-hdr";
  header.innerHTML =
    '<div class="set-sec-title">keybindings</div>' +
    '<div class="set-sec-sub">every registered command. type <code>/</code> to focus the REPL; enter runs the command.</div>';
  el.appendChild(header);

  const commands = [...runtime.commands.list()].sort((a, b) => a.id.localeCompare(b.id));

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginTop = "16px";
  table.style.fontSize = "12px";

  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr style=\"text-align:left;opacity:0.6;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;\">" +
    '<th style="padding:6px 8px;">command</th>' +
    '<th style="padding:6px 8px;">hint</th>' +
    '<th style="padding:6px 8px;">keybind</th>' +
    "</tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const c of commands) {
    const tr = document.createElement("tr");
    tr.style.borderTop = "1px solid var(--line)";
    const id = document.createElement("td");
    id.style.padding = "6px 8px";
    id.style.fontWeight = "600";
    id.textContent = c.id;
    const hint = document.createElement("td");
    hint.style.padding = "6px 8px";
    hint.style.opacity = "0.8";
    hint.textContent = c.hint ?? "";
    const kb = document.createElement("td");
    kb.style.padding = "6px 8px";
    kb.style.opacity = "0.5";
    kb.textContent = c.keybind ?? "";
    tr.appendChild(id);
    tr.appendChild(hint);
    tr.appendChild(kb);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  el.appendChild(table);
}
