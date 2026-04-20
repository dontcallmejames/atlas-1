import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "@atlas/core/src/vault/node-vault-fs.js";
import { CommandRegistry, EventBus, XpStore, MountRegistry, createContext } from "@atlas/core";
import TasksPlugin from "./main.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-tasks-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  const xp = new XpStore(vault, { base: 500, gameMode: true });
  await xp.load();
  const mounts = new MountRegistry();
  const ctx = createContext({
    pluginId: "tasks",
    core: { vault, commands, events, xp, mounts },
  });
  return { dir, vault, commands, xp, mounts, ctx };
}

describe("TasksPlugin", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("onload registers nav, view, and five commands", async () => {
    const env = await setup();
    dir = env.dir;
    const plugin = new TasksPlugin();
    await plugin.onload(env.ctx);
    expect(env.mounts.listNavs().map((n) => n.id)).toEqual(["tasks"]);
    expect(env.mounts.listViews().map((v) => v.screenId)).toEqual(["tasks"]);
    const ids = env.commands.list().map((c) => c.id).sort();
    expect(ids).toEqual([
      "tasks.add",
      "tasks.archive",
      "tasks.done",
      "tasks.list",
      "tasks.undone",
    ]);
  });

  it("tasks.add appends a task to tasks/inbox.md", async () => {
    const env = await setup();
    dir = env.dir;
    const plugin = new TasksPlugin();
    await plugin.onload(env.ctx);

    await env.commands.invoke("tasks.add", ["buy", "milk"]);
    const raw = await env.vault.read("tasks/inbox.md");
    expect(raw).toMatch(/^- \[ \] buy milk  \^id-[a-z0-9]+\n$/);
  });

  it("tasks.done marks a task and awards 25 xp", async () => {
    const env = await setup();
    dir = env.dir;
    const plugin = new TasksPlugin();
    await plugin.onload(env.ctx);

    await env.commands.invoke("tasks.add", ["something"]);
    await env.commands.invoke("tasks.done", ["something"]);
    await env.xp.flush();

    const raw = await env.vault.read("tasks/inbox.md");
    expect(raw).toMatch(/^- \[x\] something  \^id-/);
    expect(env.xp.getState().xp).toBe(25);
  });

  it("tasks.undone reopens a completed task", async () => {
    const env = await setup();
    dir = env.dir;
    const plugin = new TasksPlugin();
    await plugin.onload(env.ctx);

    await env.commands.invoke("tasks.add", ["a"]);
    await env.commands.invoke("tasks.done", ["a"]);
    await env.commands.invoke("tasks.undone", ["a"]);

    const raw = await env.vault.read("tasks/inbox.md");
    expect(raw).toMatch(/^- \[ \] a  \^id-/);
  });

  it("tasks.archive moves done tasks to tasks/archive/YYYY-MM.md", async () => {
    const env = await setup();
    dir = env.dir;
    const plugin = new TasksPlugin();
    await plugin.onload(env.ctx);

    await env.commands.invoke("tasks.add", ["one"]);
    await env.commands.invoke("tasks.add", ["two"]);
    await env.commands.invoke("tasks.done", ["one"]);
    await env.commands.invoke("tasks.archive");

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const archive = await env.vault.read(`tasks/archive/${stamp}.md`);
    expect(archive).toMatch(/one/);
    const inbox = await env.vault.read("tasks/inbox.md");
    expect(inbox).toMatch(/two/);
    expect(inbox).not.toMatch(/one/);
  });
});
