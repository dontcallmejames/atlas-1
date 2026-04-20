import {
  parseHabits,
  serializeHabits,
  parseLog,
  serializeLogEntry,
  streakFor,
  todayDate,
  defaultHabits,
} from "./parser.js";

const HABITS_PATH = "habits.yaml";

/** @param {import("@atlas/sdk").PluginContext} ctx */
async function loadHabits(ctx) {
  if (!(await ctx.vault.exists(HABITS_PATH))) {
    const seeded = serializeHabits(defaultHabits());
    await ctx.vault.write(HABITS_PATH, seeded);
    return defaultHabits();
  }
  return parseHabits(await ctx.vault.read(HABITS_PATH));
}

function logPathForDate(date) {
  // date is YYYY-MM-DD → log at log/YYYY-MM.jsonl
  return `log/${date.slice(0, 7)}.jsonl`;
}

/** @param {import("@atlas/sdk").PluginContext} ctx */
async function loadLog(ctx) {
  let files;
  try {
    files = await ctx.vault.list("log");
  } catch {
    return [];
  }
  const entries = [];
  for (const f of files) {
    if (!f.endsWith(".jsonl")) continue;
    const raw = await ctx.vault.read(`log/${f}`);
    entries.push(...parseLog(raw));
  }
  return entries;
}

/** @param {import("@atlas/sdk").PluginContext} ctx */
async function appendLog(ctx, entry) {
  await ctx.vault.append(logPathForDate(entry.date), serializeLogEntry(entry));
}

/** Rewrite the log file for a given month, excluding any entries that match a predicate. */
async function removeFromLog(ctx, date, predicate) {
  const path = logPathForDate(date);
  if (!(await ctx.vault.exists(path))) return;
  const raw = await ctx.vault.read(path);
  const kept = parseLog(raw).filter((e) => !predicate(e));
  const next = kept.map(serializeLogEntry).join("");
  await ctx.vault.write(path, next);
}

function last30Dates(today) {
  const dates = [];
  const m = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dates;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${mo}-${day}`);
  }
  return dates;
}

export default class HabitsPlugin {
  /** @param {import("@atlas/sdk").PluginContext} ctx */
  async onload(ctx) {
    this.ctx = ctx;

    ctx.nav.register({ id: "habits", label: "habits", group: "CORE" });

    ctx.ui.registerView("habits", async () => ({
      render: (el) => this.renderInto(el),
    }));

    ctx.commands.register({
      id: "checkin",
      hint: "/habits.checkin <id>",
      run: async (args) => {
        const id = args[0];
        if (!id) return;
        const habits = await loadHabits(ctx);
        const habit = habits.find((h) => h.id === id);
        if (!habit) return;
        const today = todayDate();
        const log = await loadLog(ctx);
        const already = log.some((e) => e.habitId === id && e.date === today);
        if (already) return;
        await appendLog(ctx, { ts: Date.now(), habitId: id, date: today });
        ctx.xp.award({ amount: habit.xp, reason: `habit.${id}` });
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "uncheckin",
      hint: "/habits.uncheckin <id>",
      run: async (args) => {
        const id = args[0];
        if (!id) return;
        const today = todayDate();
        await removeFromLog(ctx, today, (e) => e.habitId === id && e.date === today);
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "list",
      hint: "/habits.list",
      run: async () => {
        const habits = await loadHabits(ctx);
        const log = await loadLog(ctx);
        const today = todayDate();
        // eslint-disable-next-line no-console
        console.log(
          habits
            .map((h) => {
              const done = log.some((e) => e.habitId === h.id && e.date === today);
              const s = streakFor(log, h.id, today);
              return `  ${done ? "[x]" : "[ ]"} ${h.name}  (${h.id}, +${h.xp}xp, streak ${s}d)`;
            })
            .join("\n"),
        );
      },
    });

    ctx.commands.register({
      id: "status",
      hint: "/habits.status",
      run: async () => {
        const habits = await loadHabits(ctx);
        const log = await loadLog(ctx);
        const today = todayDate();
        const rows = habits.map((h) => ({
          id: h.id,
          name: h.name,
          streak: streakFor(log, h.id, today),
          today: log.some((e) => e.habitId === h.id && e.date === today),
        }));
        // eslint-disable-next-line no-console
        console.table(rows);
      },
    });
  }

  refresh() {
    if (this._container) this.renderInto(this._container);
  }

  /** @param {HTMLElement} el */
  async renderInto(el) {
    this._container = el;
    const habits = await loadHabits(this.ctx);
    const log = await loadLog(this.ctx);
    const today = todayDate();

    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.padding = "20px";
    wrap.style.fontFamily = "JetBrains Mono, monospace";

    const title = document.createElement("div");
    title.textContent = "~/habits/habits.yaml";
    title.style.opacity = "0.6";
    title.style.fontSize = "11px";
    title.style.marginBottom = "16px";
    wrap.appendChild(title);

    if (habits.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.5";
      empty.textContent = "no habits configured yet.";
      wrap.appendChild(empty);
      el.appendChild(wrap);
      return;
    }

    const dates = last30Dates(today);

    for (const h of habits) {
      const card = document.createElement("div");
      card.style.marginBottom = "20px";
      card.style.paddingBottom = "16px";
      card.style.borderBottom = "1px dashed var(--line)";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "12px";
      header.style.marginBottom = "10px";

      const doneToday = log.some((e) => e.habitId === h.id && e.date === today);
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = doneToday;
      box.addEventListener("change", async () => {
        if (box.checked) {
          await this.ctx.commands.invoke("habits.checkin", [h.id]);
        } else {
          await this.ctx.commands.invoke("habits.uncheckin", [h.id]);
        }
      });
      header.appendChild(box);

      const name = document.createElement("div");
      name.textContent = h.name;
      name.style.fontSize = "13px";
      name.style.fontWeight = "600";
      header.appendChild(name);

      const meta = document.createElement("div");
      meta.style.marginLeft = "auto";
      meta.style.fontSize = "11px";
      meta.style.opacity = "0.6";
      const streak = streakFor(log, h.id, today);
      meta.textContent = `+${h.xp} xp · streak ${streak}d`;
      header.appendChild(meta);

      card.appendChild(header);

      const heatmap = document.createElement("div");
      heatmap.style.display = "grid";
      heatmap.style.gridTemplateColumns = "repeat(30, 1fr)";
      heatmap.style.gap = "2px";
      heatmap.style.maxWidth = "600px";

      const byDate = new Set(log.filter((e) => e.habitId === h.id).map((e) => e.date));
      for (const d of dates) {
        const cell = document.createElement("div");
        cell.style.aspectRatio = "1";
        cell.style.borderRadius = "2px";
        cell.title = d;
        cell.style.background = byDate.has(d) ? "var(--accent)" : "var(--line)";
        cell.style.opacity = byDate.has(d) ? "1" : "0.2";
        heatmap.appendChild(cell);
      }
      card.appendChild(heatmap);

      wrap.appendChild(card);
    }

    const hint = document.createElement("div");
    hint.style.opacity = "0.5";
    hint.style.fontSize = "11px";
    hint.style.marginTop = "12px";
    hint.innerHTML =
      "commands: <code>/habits.checkin &lt;id&gt;</code> &middot; " +
      "<code>/habits.status</code> &middot; edit <code>~/habits/habits.yaml</code> to add more.";
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }
}
