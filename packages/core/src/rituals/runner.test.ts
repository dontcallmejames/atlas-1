import { describe, it, expect, vi } from "vitest";
import { CommandRegistry } from "../commands/command-registry.js";
import { parseRitual } from "./parser.js";
import { runRitual, substituteArgs } from "./runner.js";

describe("substituteArgs", () => {
  it("returns the source unchanged when no vars referenced", () => {
    expect(substituteArgs("/tasks.list", {})).toBe("/tasks.list");
  });

  it("replaces $name references with matching arg values", () => {
    expect(substituteArgs("/journal.open $date", { date: "2026-04-20" })).toBe(
      "/journal.open 2026-04-20",
    );
  });

  it("replaces multiple distinct vars on the same line", () => {
    expect(
      substituteArgs("/greet $first $last", { first: "Jim", last: "Ford" }),
    ).toBe("/greet Jim Ford");
  });

  it("leaves unknown $var references intact", () => {
    expect(substituteArgs("/foo $missing", {})).toBe("/foo $missing");
  });
});

describe("runRitual", () => {
  it("invokes each line via the command registry in order", async () => {
    const reg = new CommandRegistry();
    const calls: string[] = [];
    reg.register({
      id: "a",
      run: async () => {
        calls.push("a");
      },
    });
    reg.register({
      id: "b",
      run: async () => {
        calls.push("b");
      },
    });
    const ritual = parseRitual(["/a", "/b"].join("\n"));
    await runRitual(ritual, { commands: reg });
    expect(calls).toEqual(["a", "b"]);
  });

  it("passes parsed args to the invoked command", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "task.add", run });
    const ritual = parseRitual("/task.add buy milk");
    await runRitual(ritual, { commands: reg });
    expect(run).toHaveBeenCalledWith(["buy", "milk"]);
  });

  it("substitutes $args before parsing each line", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "journal.open", run });
    const ritual = parseRitual("/journal.open $date");
    await runRitual(ritual, { commands: reg, args: { date: "2026-04-20" } });
    expect(run).toHaveBeenCalledWith(["2026-04-20"]);
  });

  it("continues past a failing line by default", async () => {
    const reg = new CommandRegistry();
    const calls: string[] = [];
    reg.register({
      id: "a",
      run: async () => {
        throw new Error("boom");
      },
    });
    reg.register({
      id: "b",
      run: async () => {
        calls.push("b");
      },
    });
    const ritual = parseRitual(["/a", "/b"].join("\n"));
    await runRitual(ritual, { commands: reg });
    expect(calls).toEqual(["b"]);
  });

  it("halts at the first failing line when haltOnError is set", async () => {
    const reg = new CommandRegistry();
    const calls: string[] = [];
    reg.register({
      id: "a",
      run: async () => {
        throw new Error("boom");
      },
    });
    reg.register({
      id: "b",
      run: async () => {
        calls.push("b");
      },
    });
    const ritual = parseRitual(["# @halt-on-error", "/a", "/b"].join("\n"));
    await expect(runRitual(ritual, { commands: reg })).rejects.toThrow(/boom/);
    expect(calls).toEqual([]);
  });

  it("skips lines with empty/invalid command ids", async () => {
    const reg = new CommandRegistry();
    const run = vi.fn();
    reg.register({ id: "good", run });
    const ritual = parseRitual(["/", "/good"].join("\n"));
    await runRitual(ritual, { commands: reg });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
