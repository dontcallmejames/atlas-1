import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "@atlas/core/src/vault/node-vault-fs.js";
import { CommandRegistry, EventBus, XpStore, MountRegistry, createContext } from "@atlas/core";
import HabitsPlugin from "./main.js";
import { todayDate, parseHabits } from "./parser.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-habits-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  const xp = new XpStore(vault, { base: 500, gameMode: true });
  await xp.load();
  const mounts = new MountRegistry();
  const ctx = createContext({
    pluginId: "habits",
    core: { vault, commands, events, xp, mounts },
  });
  return { dir, vault, commands, xp, mounts, ctx };
}

describe("HabitsPlugin", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("onload registers nav, view, four commands, and seeds habits.yaml on first run", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    expect(env.mounts.listNavs().map((n) => n.id)).toEqual(["habits"]);
    expect(env.mounts.listViews().map((v) => v.screenId)).toEqual(["habits"]);
    const ids = env.commands.list().map((c) => c.id).sort();
    expect(ids).toEqual([
      "habits.checkin",
      "habits.list",
      "habits.status",
      "habits.uncheckin",
    ]);

    // habits.yaml is seeded lazily on first load (loadHabits), not on onload.
    // Trigger it via /habits.list.
    await env.commands.invoke("habits.list");
    const raw = await env.vault.read("habits/habits.yaml");
    expect(parseHabits(raw).length).toBeGreaterThan(0);
  });

  it("checkin appends a log entry, awards the habit's xp, and is idempotent per-day", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("habits.checkin", ["workout"]);
    await env.xp.flush();
    const today = todayDate();
    const logRaw = await env.vault.read(`habits/log/${today.slice(0, 7)}.jsonl`);
    expect(logRaw.split("\n").filter((l) => l.trim()).length).toBe(1);
    expect(env.xp.getState().xp).toBe(30);

    // Second checkin same day is a no-op.
    await env.commands.invoke("habits.checkin", ["workout"]);
    await env.xp.flush();
    const logRaw2 = await env.vault.read(`habits/log/${today.slice(0, 7)}.jsonl`);
    expect(logRaw2.split("\n").filter((l) => l.trim()).length).toBe(1);
    expect(env.xp.getState().xp).toBe(30);
  });

  it("uncheckin removes today's entry for a habit", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("habits.checkin", ["workout"]);
    await env.commands.invoke("habits.uncheckin", ["workout"]);
    const today = todayDate();
    const logRaw = await env.vault.read(`habits/log/${today.slice(0, 7)}.jsonl`);
    expect(logRaw.trim()).toBe("");
  });

  it("checkin for an unknown habit is a no-op", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new HabitsPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("habits.checkin", ["nope"]);
    await env.xp.flush();
    expect(env.xp.getState().xp).toBe(0);
    const today = todayDate();
    const path = `habits/log/${today.slice(0, 7)}.jsonl`;
    expect(await env.vault.exists(path)).toBe(false);
  });
});
