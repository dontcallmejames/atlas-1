import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "../vault/node-vault-fs.js";
import { loadPluginState, savePluginState, setPluginEnabled } from "./plugin-state.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-plugstate-"));
  const vault = new NodeVaultFs(dir);
  return { dir, vault };
}

describe("loadPluginState", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("returns an empty state when .atlas/plugins.json is missing", async () => {
    const env = await setup();
    dir = env.dir;
    const state = await loadPluginState(env.vault);
    expect(state).toEqual({ plugins: [] });
  });

  it("parses entries with id + enabled + path?", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(
      ".atlas/plugins.json",
      JSON.stringify({
        plugins: [
          { id: "tasks", enabled: true },
          { id: "journal", enabled: false },
          { id: "external", enabled: true, path: "plugins/external" },
        ],
      }),
    );
    const state = await loadPluginState(env.vault);
    expect(state.plugins).toEqual([
      { id: "tasks", enabled: true },
      { id: "journal", enabled: false },
      { id: "external", enabled: true, path: "plugins/external" },
    ]);
  });

  it("drops malformed entries", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(
      ".atlas/plugins.json",
      JSON.stringify({
        plugins: [
          { id: "ok", enabled: true },
          { enabled: true },
          { id: "noflag" },
          "not an object",
        ],
      }),
    );
    const state = await loadPluginState(env.vault);
    expect(state.plugins.map((p) => p.id)).toEqual(["ok"]);
  });

  it("returns empty state when the file is malformed JSON", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(".atlas/plugins.json", "{ not json");
    const state = await loadPluginState(env.vault);
    expect(state).toEqual({ plugins: [] });
  });
});

describe("savePluginState", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes a pretty-printed JSON file round-trippable by loadPluginState", async () => {
    const env = await setup();
    dir = env.dir;
    const state = {
      plugins: [
        { id: "tasks", enabled: true },
        { id: "journal", enabled: false },
      ],
    };
    await savePluginState(env.vault, state);
    const raw = await env.vault.read(".atlas/plugins.json");
    expect(raw).toContain("\n");
    const reload = await loadPluginState(env.vault);
    expect(reload).toEqual(state);
  });
});

describe("setPluginEnabled", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("inserts an entry when the plugin is unknown", async () => {
    const env = await setup();
    dir = env.dir;
    await setPluginEnabled(env.vault, "tasks", false);
    const state = await loadPluginState(env.vault);
    expect(state.plugins).toEqual([{ id: "tasks", enabled: false }]);
  });

  it("updates the flag when the plugin is already listed", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(
      ".atlas/plugins.json",
      JSON.stringify({ plugins: [{ id: "tasks", enabled: true }] }),
    );
    await setPluginEnabled(env.vault, "tasks", false);
    const state = await loadPluginState(env.vault);
    expect(state.plugins).toEqual([{ id: "tasks", enabled: false }]);
  });

  it("preserves other entries", async () => {
    const env = await setup();
    dir = env.dir;
    await env.vault.write(
      ".atlas/plugins.json",
      JSON.stringify({
        plugins: [
          { id: "tasks", enabled: true },
          { id: "journal", enabled: true },
        ],
      }),
    );
    await setPluginEnabled(env.vault, "journal", false);
    const state = await loadPluginState(env.vault);
    expect(state.plugins).toEqual([
      { id: "tasks", enabled: true },
      { id: "journal", enabled: false },
    ]);
  });
});
