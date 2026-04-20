import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "./node-vault-fs.js";
import { scopeVaultFs } from "./scoped-vault-fs.js";

describe("scopeVaultFs", () => {
  let dir: string;
  let root: NodeVaultFs;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-scope-"));
    root = new NodeVaultFs(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes are prefixed with the scope", async () => {
    const tasks = scopeVaultFs(root, "tasks");
    await tasks.write("inbox.md", "hello");
    expect(await root.read("tasks/inbox.md")).toBe("hello");
  });

  it("reads are prefixed with the scope", async () => {
    await root.write("tasks/a.md", "a");
    const tasks = scopeVaultFs(root, "tasks");
    expect(await tasks.read("a.md")).toBe("a");
  });

  it("list is scoped", async () => {
    await root.write("tasks/a.md", "");
    await root.write("tasks/b.md", "");
    await root.write("journal/x.md", "");
    const tasks = scopeVaultFs(root, "tasks");
    expect((await tasks.list(".")).sort()).toEqual(["a.md", "b.md"]);
  });

  it("refuses paths that escape the scope", async () => {
    const tasks = scopeVaultFs(root, "tasks");
    await expect(tasks.read("../journal/x.md")).rejects.toThrow(/outside scope/i);
    await expect(tasks.write("../oops.md", "")).rejects.toThrow(/outside scope/i);
  });

  it("exists respects the scope", async () => {
    await root.write("tasks/a.md", "");
    const tasks = scopeVaultFs(root, "tasks");
    expect(await tasks.exists("a.md")).toBe(true);
    expect(await tasks.exists("b.md")).toBe(false);
  });

  it("remove respects the scope", async () => {
    await root.write("tasks/a.md", "x");
    const tasks = scopeVaultFs(root, "tasks");
    await tasks.remove("a.md");
    expect(await root.exists("tasks/a.md")).toBe(false);
  });

  it("append respects the scope", async () => {
    const tasks = scopeVaultFs(root, "tasks");
    await tasks.append("log.jsonl", "1\n");
    await tasks.append("log.jsonl", "2\n");
    expect(await root.read("tasks/log.jsonl")).toBe("1\n2\n");
  });
});
