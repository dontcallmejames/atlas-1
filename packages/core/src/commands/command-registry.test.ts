import { describe, it, expect, vi } from "vitest";
import { CommandRegistry } from "./command-registry.js";

describe("CommandRegistry", () => {
  it("registers and invokes a command", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "go", run });
    await reg.invoke("go", ["home"]);
    expect(run).toHaveBeenCalledWith(["home"]);
  });

  it("invoke with no args passes an empty array", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "help", run });
    await reg.invoke("help");
    expect(run).toHaveBeenCalledWith([]);
  });

  it("throws when invoking an unknown command", async () => {
    const reg = new CommandRegistry();
    await expect(reg.invoke("nope")).rejects.toThrow(/unknown command: nope/i);
  });

  it("register returns an unregister fn", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    const dispose = reg.register({ id: "x", run });
    dispose();
    expect(reg.has("x")).toBe(false);
  });

  it("explicit unregister removes a command", () => {
    const reg = new CommandRegistry();
    reg.register({ id: "x", run: () => {} });
    reg.unregister("x");
    expect(reg.has("x")).toBe(false);
  });

  it("unregister is idempotent", () => {
    const reg = new CommandRegistry();
    expect(() => reg.unregister("never-registered")).not.toThrow();
  });

  it("throws when registering a duplicate id", () => {
    const reg = new CommandRegistry();
    reg.register({ id: "x", run: () => {} });
    expect(() => reg.register({ id: "x", run: () => {} })).toThrow(
      /already registered: x/i,
    );
  });

  it("list returns a snapshot of registered commands", () => {
    const reg = new CommandRegistry();
    reg.register({ id: "a", run: () => {}, hint: "/a" });
    reg.register({ id: "b", run: () => {} });
    const ids = reg.list().map((c) => c.id).sort();
    expect(ids).toEqual(["a", "b"]);
  });
});
