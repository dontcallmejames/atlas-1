import { parseTasks, serializeTasks, newTaskId } from "./parser.js";

const INBOX_PATH = "inbox.md";

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @returns {Promise<import("./parser.js").Task[]>}
 */
async function loadInbox(ctx) {
  if (!(await ctx.vault.exists(INBOX_PATH))) return [];
  return parseTasks(await ctx.vault.read(INBOX_PATH));
}

/**
 * @param {import("@atlas/sdk").PluginContext} ctx
 * @param {import("./parser.js").Task[]} tasks
 */
async function saveInbox(ctx, tasks) {
  await ctx.vault.write(INBOX_PATH, serializeTasks(tasks));
}

export default class TasksPlugin {
  /** @param {import("@atlas/sdk").PluginContext} ctx */
  async onload(ctx) {
    this.ctx = ctx;

    ctx.nav.register({ id: "tasks", label: "tasks", group: "CORE" });

    ctx.ui.registerView("tasks", async () => ({
      render: (el) => this.renderInto(el),
    }));

    ctx.commands.register({
      id: "add",
      hint: "/tasks.add <text>",
      run: async (args) => {
        const text = args.join(" ").trim();
        if (!text) return;
        const tasks = await loadInbox(ctx);
        tasks.push({ id: newTaskId(), done: false, text });
        await saveInbox(ctx, tasks);
        this.refresh();
      },
    });

    ctx.commands.register({
      id: "done",
      hint: "/tasks.done <id|text>",
      run: async (args) => {
        const query = args.join(" ").trim();
        if (!query) return;
        const tasks = await loadInbox(ctx);
        const idx = tasks.findIndex(
          (t) => t.id === query || t.text.toLowerCase() === query.toLowerCase(),
        );
        if (idx < 0) return;
        if (!tasks[idx].done) {
          tasks[idx].done = true;
          await saveInbox(ctx, tasks);
          ctx.xp.award({ amount: 25, reason: "task.done" });
          this.refresh();
        }
      },
    });

    ctx.commands.register({
      id: "undone",
      hint: "/tasks.undone <id|text>",
      run: async (args) => {
        const query = args.join(" ").trim();
        if (!query) return;
        const tasks = await loadInbox(ctx);
        const idx = tasks.findIndex(
          (t) => t.id === query || t.text.toLowerCase() === query.toLowerCase(),
        );
        if (idx < 0) return;
        if (tasks[idx].done) {
          tasks[idx].done = false;
          await saveInbox(ctx, tasks);
          this.refresh();
        }
      },
    });

    ctx.commands.register({
      id: "list",
      hint: "/tasks.list",
      run: async () => {
        const tasks = await loadInbox(ctx);
        const lines = tasks.map(
          (t) => `  ${t.done ? "[x]" : "[ ]"} ${t.text}  (${t.id})`,
        );
        // eslint-disable-next-line no-console
        console.log(`tasks (${tasks.length}):\n${lines.join("\n")}`);
      },
    });

    ctx.commands.register({
      id: "archive",
      hint: "/tasks.archive",
      run: async () => {
        const tasks = await loadInbox(ctx);
        const done = tasks.filter((t) => t.done);
        const open = tasks.filter((t) => !t.done);
        if (done.length === 0) return;
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const archivePath = `archive/${stamp}.md`;
        const existing = (await ctx.vault.exists(archivePath))
          ? await ctx.vault.read(archivePath)
          : "";
        const merged = existing + serializeTasks(done);
        await ctx.vault.write(archivePath, merged);
        await saveInbox(ctx, open);
        this.refresh();
      },
    });
  }

  /** @param {import("@atlas/sdk").PluginContext} _ctx */
  async onunload(_ctx) {
    // Commands auto-unregister via their disposer (we don't capture them).
    // For M4 this is acceptable; v2 can tighten it up.
  }

  /** Attach a re-render hook that fires after tasks change. */
  refresh() {
    if (this._container) this.renderInto(this._container);
  }

  /** @param {HTMLElement} el */
  async renderInto(el) {
    this._container = el;
    const tasks = await loadInbox(this.ctx);
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.padding = "20px";
    wrap.style.fontFamily = "JetBrains Mono, monospace";

    const title = document.createElement("div");
    title.textContent = "~/tasks/inbox.md";
    title.style.opacity = "0.6";
    title.style.fontSize = "11px";
    title.style.marginBottom = "16px";
    wrap.appendChild(title);

    if (tasks.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.5";
      empty.style.fontSize = "12px";
      empty.textContent = "no tasks yet. try /tasks.add buy milk";
      wrap.appendChild(empty);
    } else {
      const list = document.createElement("ul");
      list.style.listStyle = "none";
      list.style.padding = "0";
      list.style.margin = "0";
      for (const t of tasks) {
        const li = document.createElement("li");
        li.style.padding = "6px 0";
        li.style.fontSize = "13px";
        li.style.display = "flex";
        li.style.gap = "10px";
        li.style.alignItems = "center";
        if (t.done) {
          li.style.opacity = "0.5";
          li.style.textDecoration = "line-through";
        }
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = t.done;
        box.addEventListener("change", async () => {
          if (box.checked) {
            await this.ctx.commands.invoke("tasks.done", [t.id]);
          } else {
            await this.ctx.commands.invoke("tasks.undone", [t.id]);
          }
        });
        const text = document.createElement("span");
        text.textContent = t.text;
        const id = document.createElement("span");
        id.textContent = t.id;
        id.style.opacity = "0.4";
        id.style.fontSize = "10px";
        id.style.marginLeft = "auto";
        li.appendChild(box);
        li.appendChild(text);
        li.appendChild(id);
        list.appendChild(li);
      }
      wrap.appendChild(list);
    }

    const hint = document.createElement("div");
    hint.style.marginTop = "20px";
    hint.style.opacity = "0.5";
    hint.style.fontSize = "11px";
    hint.innerHTML =
      "commands: <code>/tasks.add &lt;text&gt;</code> &middot; " +
      "<code>/tasks.done &lt;id|text&gt;</code> &middot; " +
      "<code>/tasks.archive</code>";
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }
}
