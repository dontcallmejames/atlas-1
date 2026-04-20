import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "../vault/node-vault-fs.js";
import { CommandRegistry } from "../commands/command-registry.js";
import { EventBus } from "../events/event-bus.js";
import { XpStore } from "../xp/xp-store.js";
import { createContext } from "./context-factory.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-ctx-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  const xp = new XpStore(vault, { base: 500, gameMode: true });
  await xp.load();
  return {
    dir,
    core: { vault, commands, events, xp },
  };
}

describe("createContext", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("vault is scoped to <pluginId>/", async () => {
    const env = await setup();
    dir = env.dir;
    const ctx = createContext({ pluginId: "tasks", core: env.core });
    await ctx.vault.write("inbox.md", "hi");
    expect(await env.core.vault.read("tasks/inbox.md")).toBe("hi");
  });

  it("commands.register auto-namespaces the id", async () => {
    const env = await setup();
    dir = env.dir;
    const ctx = createContext({ pluginId: "tasks", core: env.core });
    const run = vi.fn();
    ctx.commands.register({ id: "add", run });
    expect(env.core.commands.has("tasks.add")).toBe(true);
    await env.core.commands.invoke("tasks.add", ["buy", "milk"]);
    expect(run).toHaveBeenCalledWith(["buy", "milk"]);
  });

  it("commands.register refuses ids containing a dot", async () => {
    const env = await setup();
    dir = env.dir;
    const ctx = createContext({ pluginId: "tasks", core: env.core });
    expect(() =>
      ctx.commands.register({ id: "sub.add", run: () => {} }),
    ).toThrow(/must not contain '\.'/i);
  });

  it("xp.award passes source=pluginId through to the store", async () => {
    const env = await setup();
    dir = env.dir;
    const ctx = createContext({ pluginId: "tasks", core: env.core });
    ctx.xp.award({ amount: 30, reason: "task.done" });
    await env.core.xp.flush();
    const state = env.core.xp.getState();
    expect(state.xp).toBe(30);
  });

  it("nav/ui/settings/theme APIs exist and return disposer fns", async () => {
    const env = await setup();
    dir = env.dir;
    const ctx = createContext({ pluginId: "tasks", core: env.core });
    const offNav = ctx.nav.register({ id: "tasks", label: "tasks" });
    const offView = ctx.ui.registerView("tasks", async () => ({}));
    const offSeg = ctx.ui.registerStatuslineSegment({
      id: "seg",
      render: () => "x",
    });
    const offSettings = ctx.settings.register({});
    const offTheme = ctx.theme.registerPack("id", "css");
    for (const off of [offNav, offView, offSeg, offSettings, offTheme]) {
      expect(typeof off).toBe("function");
      off();
    }
    expect(ctx.theme.currentTokens()).toEqual({});
  });
});
