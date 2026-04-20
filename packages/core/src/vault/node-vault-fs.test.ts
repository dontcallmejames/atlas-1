import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeVaultFs } from "./node-vault-fs.js";

describe("NodeVaultFs", () => {
  let dir: string;
  let vault: NodeVaultFs;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-vault-"));
    vault = new NodeVaultFs(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a file", async () => {
    await writeFile(join(dir, "hello.txt"), "hi", "utf8");
    expect(await vault.read("hello.txt")).toBe("hi");
  });

  it("writes a file and creates parent dirs", async () => {
    await vault.write("a/b/c.txt", "nested");
    expect(await vault.read("a/b/c.txt")).toBe("nested");
  });

  it("append adds to the end; creates file if missing", async () => {
    await vault.append("log.txt", "one\n");
    await vault.append("log.txt", "two\n");
    expect(await vault.read("log.txt")).toBe("one\ntwo\n");
  });

  it("lists files in a directory (non-recursive)", async () => {
    await mkdir(join(dir, "tasks"));
    await writeFile(join(dir, "tasks", "a.md"), "", "utf8");
    await writeFile(join(dir, "tasks", "b.md"), "", "utf8");
    const names = (await vault.list("tasks")).sort();
    expect(names).toEqual(["a.md", "b.md"]);
  });

  it("list returns [] for a missing directory", async () => {
    expect(await vault.list("nope")).toEqual([]);
  });

  it("exists returns true for present file, false otherwise", async () => {
    await vault.write("x.txt", "x");
    expect(await vault.exists("x.txt")).toBe(true);
    expect(await vault.exists("y.txt")).toBe(false);
  });

  it("remove deletes a file", async () => {
    await vault.write("x.txt", "x");
    await vault.remove("x.txt");
    expect(await vault.exists("x.txt")).toBe(false);
  });

  it("remove is idempotent on missing files", async () => {
    await expect(vault.remove("never.txt")).resolves.toBeUndefined();
  });

  it("refuses paths that escape the root via ..", async () => {
    await expect(vault.read("../../etc/passwd")).rejects.toThrow(/outside vault/i);
    await expect(vault.write("../outside.txt", "x")).rejects.toThrow(/outside vault/i);
  });
});
