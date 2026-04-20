import { describe, it, expect } from "vitest";
import { parseCommand } from "./parser.js";

describe("parseCommand", () => {
  it("strips a leading slash", () => {
    expect(parseCommand("/go home")).toEqual({
      id: "go",
      args: ["home"],
      raw: "go home",
    });
  });

  it("accepts input without a leading slash", () => {
    expect(parseCommand("go home")).toEqual({
      id: "go",
      args: ["home"],
      raw: "go home",
    });
  });

  it("parses dot-namespaced ids", () => {
    expect(parseCommand("/task.add buy milk")).toEqual({
      id: "task.add",
      args: ["buy", "milk"],
      raw: "task.add buy milk",
    });
  });

  it("preserves double-quoted tokens as one arg", () => {
    expect(parseCommand('/task add "buy milk and eggs"')).toEqual({
      id: "task",
      args: ["add", "buy milk and eggs"],
      raw: 'task add "buy milk and eggs"',
    });
  });

  it("collapses runs of whitespace", () => {
    expect(parseCommand("/go    home")).toEqual({
      id: "go",
      args: ["home"],
      raw: "go    home",
    });
  });

  it("returns an empty id for empty or whitespace-only input", () => {
    expect(parseCommand("")).toEqual({ id: "", args: [], raw: "" });
    expect(parseCommand("   ")).toEqual({ id: "", args: [], raw: "" });
    expect(parseCommand("/")).toEqual({ id: "", args: [], raw: "" });
  });

  it("treats unterminated quotes as regular characters", () => {
    expect(parseCommand('/task add "oops')).toEqual({
      id: "task",
      args: ["add", '"oops'],
      raw: 'task add "oops',
    });
  });
});
