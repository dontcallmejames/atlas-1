import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "../vault/node-vault-fs.js";
import { ConfigStore } from "./config-store.js";
import { DEFAULT_CONFIG } from "./defaults.js";

describe("ConfigStore", () => {
  let dir: string;
  let vault: NodeVaultFs;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-config-"));
    vault = new NodeVaultFs(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns defaults when .atlas/config.json is missing", async () => {
    const store = new ConfigStore(vault);
    await store.load();
    expect(store.get()).toEqual(DEFAULT_CONFIG);
  });

  it("merges stored values over defaults", async () => {
    await vault.write(
      ".atlas/config.json",
      JSON.stringify({ name: "Polaris", accent: "#abcdef" }),
    );
    const store = new ConfigStore(vault);
    await store.load();
    expect(store.get().name).toBe("Polaris");
    expect(store.get().accent).toBe("#abcdef");
    expect(store.get().theme).toBe(DEFAULT_CONFIG.theme); // untouched
  });

  it("save() writes the current config to disk", async () => {
    const store = new ConfigStore(vault);
    await store.load();
    store.update({ name: "Hearth" });
    await store.save();
    const raw = JSON.parse(await vault.read(".atlas/config.json"));
    expect(raw.name).toBe("Hearth");
  });

  it("subscribers fire on update()", async () => {
    const store = new ConfigStore(vault);
    await store.load();
    let latest = store.get();
    const off = store.subscribe((c) => {
      latest = c;
    });
    store.update({ crt: true });
    expect(latest.crt).toBe(true);
    off();
    store.update({ crt: false });
    expect(latest.crt).toBe(true); // unsubscribed
  });

  it("update() is a partial merge", async () => {
    const store = new ConfigStore(vault);
    await store.load();
    store.update({ name: "A" });
    store.update({ tagline: "b" });
    expect(store.get().name).toBe("A");
    expect(store.get().tagline).toBe("b");
  });
});
