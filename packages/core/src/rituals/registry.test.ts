import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "../vault/node-vault-fs.js";
import { CommandRegistry } from "../commands/command-registry.js";
import { EventBus } from "../events/event-bus.js";
import { RitualRegistry } from "./registry.js";
import { DEFAULT_RITUALS } from "./defaults.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-rituals-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  return { dir, vault, commands, events };
}

describe("RitualRegistry", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("seeds default rituals on first load when the dir is missing", async () => {
    const env = await setup();
    dir = env.dir;
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    for (const name of Object.keys(DEFAULT_RITUALS)) {
      expect(await env.vault.exists(`.atlas/rituals/${name}`)).toBe(true);
    }
  });

  it("does not overwrite existing rituals on subsequent loads", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(".atlas/rituals/morning.atlas", "# custom\n/custom");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    expect(await env.vault.read(".atlas/rituals/morning.atlas")).toBe("# custom\n/custom");
  });

  it("lists rituals by bare name (no extension, no subfolders)", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(".atlas/rituals/morning.atlas", "/noop");
    await env.vault.write(".atlas/rituals/focus.atlas", "/noop");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    expect(reg.listRituals().sort()).toEqual(["evening", "focus", "morning"]);
  });

  it("runRitual executes the named ritual", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "tap",
      run: async () => {
        calls.push("tap");
      },
    });
    await env.vault.write(".atlas/rituals/test.atlas", "/tap");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    await reg.runRitual("test");
    expect(calls).toEqual(["tap"]);
  });

  it("runRitual with args substitutes `$name` vars", async () => {
    const env = await setup();
    dir = env.dir;
    const run = vi.fn();
    env.commands.register({ id: "echo", run });
    await env.vault.write(".atlas/rituals/t.atlas", "/echo $who");
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    await reg.runRitual("t", { who: "jim" });
    expect(run).toHaveBeenCalledWith(["jim"]);
  });

  it("runRitual is a no-op for an unknown name", async () => {
    const env = await setup();
    dir = env.dir;
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();
    await expect(reg.runRitual("nope")).resolves.toBeUndefined();
  });

  it("@on event trigger fires the ritual when the matching event is emitted", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "hit",
      run: async () => {
        calls.push("hit");
      },
    });
    await env.vault.write(
      ".atlas/rituals/on-ready.atlas",
      ["# @on app:ready", "/hit"].join("\n"),
    );
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    env.events.emit("app:ready", undefined);
    // Emit is sync, but runRitual is async. Give microtasks a tick.
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(["hit"]);
  });

  it("@cron trigger fires when tick() is called at the matching minute", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "beep",
      run: async () => {
        calls.push("beep");
      },
    });
    await env.vault.write(
      ".atlas/rituals/daily.atlas",
      ["# @cron 0 8 * * *", "/beep"].join("\n"),
    );
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    // Not the scheduled minute
    await reg.tick(new Date(2026, 3, 20, 7, 59, 0));
    expect(calls).toEqual([]);

    // The scheduled minute
    await reg.tick(new Date(2026, 3, 20, 8, 0, 0));
    expect(calls).toEqual(["beep"]);
  });

  it("tick does not double-fire within the same minute", async () => {
    const env = await setup();
    dir = env.dir;
    const calls: string[] = [];
    env.commands.register({
      id: "beep",
      run: async () => {
        calls.push("beep");
      },
    });
    await env.vault.write(
      ".atlas/rituals/daily.atlas",
      ["# @cron 0 8 * * *", "/beep"].join("\n"),
    );
    const reg = new RitualRegistry(env.vault, env.commands, env.events);
    await reg.load();

    const minute = new Date(2026, 3, 20, 8, 0, 0);
    await reg.tick(minute);
    await reg.tick(new Date(2026, 3, 20, 8, 0, 30)); // same minute, 30 s later
    expect(calls).toEqual(["beep"]);
  });
});
