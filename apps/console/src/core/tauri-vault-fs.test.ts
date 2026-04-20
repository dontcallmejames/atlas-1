import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri core invoke API. Must be set up before importing the SUT.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { TauriVaultFs } from "./tauri-vault-fs.js";

describe("TauriVaultFs", () => {
  let vault: TauriVaultFs;

  beforeEach(() => {
    invokeMock.mockReset();
    vault = new TauriVaultFs();
  });

  it("read invokes vault_read with the path", async () => {
    invokeMock.mockResolvedValueOnce("hello");
    expect(await vault.read("a.md")).toBe("hello");
    expect(invokeMock).toHaveBeenCalledWith("vault_read", { path: "a.md" });
  });

  it("write invokes vault_write with path + content", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.write("a/b.md", "hi");
    expect(invokeMock).toHaveBeenCalledWith("vault_write", { path: "a/b.md", content: "hi" });
  });

  it("append invokes vault_append with path + content", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.append("log.jsonl", "line\n");
    expect(invokeMock).toHaveBeenCalledWith("vault_append", { path: "log.jsonl", content: "line\n" });
  });

  it("list returns the array from vault_list", async () => {
    invokeMock.mockResolvedValueOnce(["a.md", "b.md"]);
    expect(await vault.list("tasks")).toEqual(["a.md", "b.md"]);
    expect(invokeMock).toHaveBeenCalledWith("vault_list", { path: "tasks" });
  });

  it("exists returns the boolean from vault_exists", async () => {
    invokeMock.mockResolvedValueOnce(true);
    expect(await vault.exists("a.md")).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("vault_exists", { path: "a.md" });
  });

  it("remove invokes vault_remove", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.remove("a.md");
    expect(invokeMock).toHaveBeenCalledWith("vault_remove", { path: "a.md" });
  });

  it("setVaultRoot invokes set_vault_root with absolute path", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await vault.setVaultRoot("/home/user/atlas");
    expect(invokeMock).toHaveBeenCalledWith("set_vault_root", { path: "/home/user/atlas" });
  });

  it("getVaultRoot returns the string from get_vault_root", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/atlas");
    expect(await vault.getVaultRoot()).toBe("/home/user/atlas");
  });

  it("getVaultRoot returns null when unset", async () => {
    invokeMock.mockResolvedValueOnce(null);
    expect(await vault.getVaultRoot()).toBeNull();
  });
});
