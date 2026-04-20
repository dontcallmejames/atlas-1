import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "../vault/node-vault-fs.js";
import { XpStore } from "./xp-store.js";

describe("XpStore", () => {
  let dir: string;
  let vault: NodeVaultFs;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-xp-"));
    vault = new NodeVaultFs(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("initial state has zeros when log is missing", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    const s = store.getState();
    expect(s.xp).toBe(0);
    expect(s.lvl).toBe(0);
    expect(s.hp).toBe(0);
    expect(s.nrg).toBe(0);
    expect(s.focus).toBe(0);
  });

  it("award(xp) adds to total and recomputes level", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    store.award({ amount: 250, reason: "task.done", source: "tasks" });
    store.award({ amount: 260, reason: "task.done", source: "tasks" });
    expect(store.getState().xp).toBe(510);
    expect(store.getState().lvl).toBe(1);
  });

  it("award(hp) updates only the hp field", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    store.award({ amount: 80, reason: "vitals.set", source: "core", kind: "hp" });
    expect(store.getState().hp).toBe(80);
    expect(store.getState().xp).toBe(0);
  });

  it("award writes the event to .atlas/xp.log as JSONL", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    store.award({ amount: 50, reason: "r", source: "p" });
    // let the pending append settle
    await store.flush();
    const raw = await vault.read(".atlas/xp.log");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]!);
    expect(event.delta).toBe(50);
    expect(event.reason).toBe("r");
    expect(event.source).toBe("p");
    expect(typeof event.ts).toBe("number");
  });

  it("load() replays the existing log", async () => {
    const events = [
      { ts: 1, source: "tasks", delta: 100, reason: "task.done", kind: "xp" },
      { ts: 2, source: "tasks", delta: 150, reason: "task.done", kind: "xp" },
      { ts: 3, source: "core", delta: 70, reason: "v", kind: "hp" },
    ];
    await vault.write(
      ".atlas/xp.log",
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    expect(store.getState().xp).toBe(250);
    expect(store.getState().hp).toBe(70);
  });

  it("gameMode=false makes award a no-op", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: false });
    await store.load();
    store.award({ amount: 100, reason: "r", source: "p" });
    await store.flush();
    expect(store.getState().xp).toBe(0);
    expect(await vault.exists(".atlas/xp.log")).toBe(false);
  });

  it("onChange fires after each award", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    const snapshots: number[] = [];
    store.onChange((s) => snapshots.push(s.xp));
    store.award({ amount: 10, reason: "r", source: "p" });
    store.award({ amount: 5, reason: "r", source: "p" });
    expect(snapshots).toEqual([10, 15]);
  });
});

describe("XpStore snapshot + async replay", () => {
  let dir: string;
  let vault: NodeVaultFs;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-xp-snap-"));
    vault = new NodeVaultFs(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes xp-state.json on flush", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    store.award({ amount: 25, reason: "t", source: "test", kind: "xp" });
    await store.flush();
    expect(await vault.exists(".atlas/xp-state.json")).toBe(true);
    const raw = await vault.read(".atlas/xp-state.json");
    const snap = JSON.parse(raw);
    expect(snap.state.xp).toBe(25);
    expect(typeof snap.lastSeenTs).toBe("number");
  });

  it("load() fast-paths from snapshot without reading the full log", async () => {
    const lines = Array.from({ length: 500 }, (_, i) =>
      JSON.stringify({ ts: 1_000_000 + i, source: "seed", delta: 1, reason: "", kind: "xp" })
    ).join("\n") + "\n";
    await vault.write(".atlas/xp.log", lines);

    const seed = new XpStore(vault, { base: 500, gameMode: true });
    await seed.load();
    await seed.flush();

    const more = Array.from({ length: 3 }, (_, i) =>
      JSON.stringify({ ts: 2_000_000 + i, source: "new", delta: 10, reason: "", kind: "xp" })
    ).join("\n") + "\n";
    await vault.append(".atlas/xp.log", more);

    const fresh = new XpStore(vault, { base: 500, gameMode: true });
    await fresh.load();
    expect(fresh.getState().xp).toBe(500);
    await fresh.ready;
    expect(fresh.getState().xp).toBe(530);
  });
});

describe("XpStore streak", () => {
  let dir: string;
  let vault: NodeVaultFs;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-xp-streak-"));
    vault = new NodeVaultFs(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is 0 with no events", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    expect(store.getState().streak).toBe(0);
  });

  it("is 1 after a single event today", async () => {
    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    store.award({ amount: 10, reason: "t", source: "test", kind: "xp" });
    await store.flush();
    expect(store.getState().streak).toBe(1);
  });

  it("counts consecutive local-calendar days, gaps reset", async () => {
    const today = new Date();
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    const dayBefore = new Date(today); dayBefore.setDate(today.getDate() - 2);
    const gap = new Date(today); gap.setDate(today.getDate() - 5);
    const lines = [gap, dayBefore, yest, today].map((d) => JSON.stringify({
      ts: d.getTime(), source: "test", delta: 1, reason: "t", kind: "xp",
    })).join("\n") + "\n";
    await vault.write(".atlas/xp.log", lines);

    const store = new XpStore(vault, { base: 500, gameMode: true });
    await store.load();
    expect(store.getState().streak).toBe(3);
  });
});
