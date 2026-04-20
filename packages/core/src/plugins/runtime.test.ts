import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "../vault/node-vault-fs.js";
import { createRuntime } from "../runtime.js";

const TEST_PLUGIN_SRC = `
export default class TestPlugin {
  async onload(ctx) {
    this.ctx = ctx;
    ctx.commands.register({
      id: "add",
      run: async (args) => {
        await ctx.vault.append("inbox.md", args.join(" ") + "\\n");
        ctx.xp.award({ amount: 10, reason: "task.done" });
      },
    });
  }
  async onunload(ctx) {
    ctx.commands.unregister("add");
  }
}
`;

describe("createRuntime integration", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-rt-"));
  });
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("loads a plugin from disk, routes its command, persists side effects", async () => {
    await mkdir(join(dir, "plugins", "tasktest"), { recursive: true });
    await writeFile(join(dir, "plugins", "tasktest", "main.js"), TEST_PLUGIN_SRC, "utf8");
    await mkdir(join(dir, ".atlas"), { recursive: true });
    await writeFile(
      join(dir, ".atlas", "plugins.json"),
      JSON.stringify({
        plugins: [
          { id: "tasktest", enabled: true, path: "plugins/tasktest" },
        ],
      }),
      "utf8",
    );

    const vault = new NodeVaultFs(dir);
    const runtime = await createRuntime({ vault, vaultRoot: dir });
    await runtime.load();

    expect(runtime.commands.has("tasktest.add")).toBe(true);

    await runtime.commands.invoke("tasktest.add", ["buy", "milk"]);
    await runtime.xp.flush();

    expect(await vault.read("tasktest/inbox.md")).toBe("buy milk\n");
    expect(runtime.xp.getState().xp).toBe(10);

    await runtime.unload();
    expect(runtime.commands.has("tasktest.add")).toBe(false);
  });

  it("skips plugins with enabled: false", async () => {
    await mkdir(join(dir, "plugins", "off"), { recursive: true });
    await writeFile(join(dir, "plugins", "off", "main.js"), TEST_PLUGIN_SRC, "utf8");
    await mkdir(join(dir, ".atlas"), { recursive: true });
    await writeFile(
      join(dir, ".atlas", "plugins.json"),
      JSON.stringify({
        plugins: [{ id: "off", enabled: false, path: "plugins/off" }],
      }),
      "utf8",
    );

    const vault = new NodeVaultFs(dir);
    const runtime = await createRuntime({ vault, vaultRoot: dir });
    await runtime.load();

    expect(runtime.commands.has("off.add")).toBe(false);
  });

  it("works with a missing .atlas/plugins.json (no plugins loaded)", async () => {
    const vault = new NodeVaultFs(dir);
    const runtime = await createRuntime({ vault, vaultRoot: dir });
    await runtime.load(); // should not throw
    expect(runtime.commands.list()).toEqual([]);
  });
});
