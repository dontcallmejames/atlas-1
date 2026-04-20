import { todayDate, parseDate, dateToPath, pathToDate } from "./parser.js";

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @param {string} date  YYYY-MM-DD
 * @returns {Promise<string>}
 */
async function readNote(ctx, date) {
  const d = parseDate(date);
  if (!d) return "";
  const path = dateToPath(d);
  if (!(await ctx.vault.exists(path))) return "";
  return ctx.vault.read(path);
}

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @param {string} date
 * @param {string} content
 */
async function writeNote(ctx, date, content) {
  const d = parseDate(date);
  if (!d) throw new Error(`invalid date: ${date}`);
  await ctx.vault.write(dateToPath(d), content);
}

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @returns {Promise<string[]>}  array of YYYY-MM-DD in descending order
 */
async function listNoteDates(ctx) {
  const dates = new Set();
  let years;
  try {
    years = await ctx.vault.list(".");
  } catch {
    return [];
  }
  for (const y of years) {
    if (!/^\d{4}$/.test(y)) continue;
    let months;
    try {
      months = await ctx.vault.list(y);
    } catch {
      continue;
    }
    for (const m of months) {
      if (!/^\d{2}$/.test(m)) continue;
      let files;
      try {
        files = await ctx.vault.list(`${y}/${m}`);
      } catch {
        continue;
      }
      for (const f of files) {
        const d = pathToDate(`${y}/${m}/${f}`);
        if (d) dates.add(d);
      }
    }
  }
  return [...dates].sort().reverse();
}

export default class JournalPlugin {
  /** @param {import("@atlas/sdk").PluginContext} ctx */
  async onload(ctx) {
    this.ctx = ctx;
    this.viewDate = todayDate();

    ctx.nav.register({ id: "journal", label: "journal", group: "CORE" });

    ctx.ui.registerView("journal", async () => ({
      render: (el) => this.renderInto(el),
    }));

    ctx.commands.register({
      id: "today",
      hint: "/journal.today",
      run: async () => {
        this.viewDate = todayDate();
        await ctx.commands.invoke("go", ["journal"]);
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "open",
      hint: "/journal.open <YYYY-MM-DD>",
      run: async (args) => {
        const date = args[0];
        if (!date || !parseDate(date)) return;
        this.viewDate = date;
        await ctx.commands.invoke("go", ["journal"]);
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "append",
      hint: "/journal.append <text>",
      run: async (args) => {
        const text = args.join(" ").trim();
        if (!text) return;
        const date = todayDate();
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const line = `- **${hh}:${mm}** ${text}\n`;
        const current = await readNote(ctx, date);
        const header = current ? "" : `# ${date}\n\n`;
        await writeNote(ctx, date, (current || header) + line);
        if (this.viewDate === date) this.refresh();
      },
    });

    ctx.commands.register({
      id: "list",
      hint: "/journal.list",
      run: async () => {
        const dates = await listNoteDates(ctx);
        // eslint-disable-next-line no-console
        console.log(`journal entries (${dates.length}):\n${dates.map((d) => "  " + d).join("\n")}`);
      },
    });
  }

  /** Re-render the view if it's currently mounted. */
  refresh() {
    if (this._container) this.renderInto(this._container);
  }

  /** @param {HTMLElement} el */
  async renderInto(el) {
    this._container = el;
    const date = this.viewDate;
    const content = await readNote(this.ctx, date);
    const dates = await listNoteDates(this.ctx);

    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.padding = "20px";
    wrap.style.fontFamily = "JetBrains Mono, monospace";
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr 180px";
    wrap.style.gap = "20px";

    // --- main column: editor
    const main = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = `~/journal/${date}.md`;
    title.style.opacity = "0.6";
    title.style.fontSize = "11px";
    title.style.marginBottom = "12px";
    main.appendChild(title);

    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.placeholder = `# ${date}\n\nthinking...`;
    textarea.style.width = "100%";
    textarea.style.minHeight = "60vh";
    textarea.style.background = "transparent";
    textarea.style.color = "inherit";
    textarea.style.fontFamily = "inherit";
    textarea.style.fontSize = "13px";
    textarea.style.border = "1px dashed var(--line)";
    textarea.style.padding = "12px";
    textarea.style.outline = "none";
    textarea.style.resize = "vertical";
    const save = async () => {
      await writeNote(this.ctx, date, textarea.value);
    };
    let saveTimer;
    textarea.addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { void save(); }, 500);
    });
    textarea.addEventListener("blur", () => {
      clearTimeout(saveTimer);
      void save();
    });
    main.appendChild(textarea);

    const hint = document.createElement("div");
    hint.style.marginTop = "8px";
    hint.style.opacity = "0.5";
    hint.style.fontSize = "11px";
    hint.innerHTML =
      "autosaves 500 ms after last keystroke and on blur &middot; " +
      "<code>/journal.append &lt;text&gt;</code> for quick capture";
    main.appendChild(hint);

    // --- side column: recent dates
    const side = document.createElement("div");
    const sideTitle = document.createElement("div");
    sideTitle.textContent = "recent";
    sideTitle.style.opacity = "0.6";
    sideTitle.style.fontSize = "10px";
    sideTitle.style.letterSpacing = "0.08em";
    sideTitle.style.textTransform = "uppercase";
    sideTitle.style.marginBottom = "8px";
    side.appendChild(sideTitle);

    const list = document.createElement("ul");
    list.style.listStyle = "none";
    list.style.padding = "0";
    list.style.margin = "0";
    list.style.fontSize = "12px";
    const shown = dates.slice(0, 14);
    if (shown.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.4";
      empty.style.fontSize = "11px";
      empty.textContent = "(no entries yet)";
      side.appendChild(empty);
    } else {
      for (const d of shown) {
        const li = document.createElement("li");
        li.style.padding = "4px 6px";
        li.style.cursor = "pointer";
        li.style.borderRadius = "3px";
        if (d === date) {
          li.style.background = "var(--ink)";
          li.style.color = "var(--paper)";
        }
        li.textContent = d;
        li.addEventListener("click", () => {
          this.viewDate = d;
          this.refresh();
        });
        list.appendChild(li);
      }
      side.appendChild(list);
    }

    wrap.appendChild(main);
    wrap.appendChild(side);
    el.appendChild(wrap);
  }
}
