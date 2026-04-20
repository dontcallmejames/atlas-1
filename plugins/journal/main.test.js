import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "@atlas/core/src/vault/node-vault-fs.js";
import { CommandRegistry, EventBus, XpStore, MountRegistry, createContext } from "@atlas/core";
import JournalPlugin from "./main.js";
import { todayDate, dateToPath, parseDate } from "./parser.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-journal-"));
  const vault = new NodeVaultFs(dir);
  const commands = new CommandRegistry();
  const events = new EventBus();
  const xp = new XpStore(vault, { base: 500, gameMode: true });
  await xp.load();
  const mounts = new MountRegistry();
  const ctx = createContext({
    pluginId: "journal",
    core: { vault, commands, events, xp, mounts },
  });
  return { dir, vault, commands, xp, mounts, ctx };
}

describe("JournalPlugin", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("onload registers nav, view, and four commands", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);
    expect(env.mounts.listNavs().map((n) => n.id)).toEqual(["journal"]);
    expect(env.mounts.listViews().map((v) => v.screenId)).toEqual(["journal"]);
    const ids = env.commands.list().map((c) => c.id).sort();
    expect(ids).toEqual([
      "journal.append",
      "journal.list",
      "journal.open",
      "journal.today",
    ]);
  });

  it("journal.append writes a timestamped line to today's note", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("journal.append", ["hello", "world"]);

    const today = todayDate();
    const d = parseDate(today);
    const path = `journal/${dateToPath(d)}`;
    const raw = await env.vault.read(path);
    expect(raw).toMatch(new RegExp(`^# ${today}\\n\\n- \\*\\*\\d{2}:\\d{2}\\*\\* hello world\\n$`));
  });

  it("journal.append appends to an existing note without re-seeding the header", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);

    await env.commands.invoke("journal.append", ["first"]);
    await env.commands.invoke("journal.append", ["second"]);

    const today = todayDate();
    const d = parseDate(today);
    const path = `journal/${dateToPath(d)}`;
    const raw = await env.vault.read(path);
    const headerCount = (raw.match(new RegExp(`^# ${today}$`, "gm")) || []).length;
    expect(headerCount).toBe(1);
    expect(raw).toMatch(/first/);
    expect(raw).toMatch(/second/);
  });

  it("journal.open rejects a malformed date silently", async () => {
    const env = await setup();
    dir = env.dir;
    const p = new JournalPlugin();
    await p.onload(env.ctx);

    // Should not throw
    await env.commands.invoke("journal.open", ["not-a-date"]);
    expect(true).toBe(true);
  });
});
