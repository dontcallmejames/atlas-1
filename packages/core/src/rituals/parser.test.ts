import { describe, it, expect } from "vitest";
import { parseRitual } from "./parser.js";

describe("parseRitual", () => {
  it("parses a simple multi-line ritual", () => {
    const src = [
      "/journal.today",
      "/tasks.list",
      "/habits.checkin workout",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.lines).toEqual([
      "/journal.today",
      "/tasks.list",
      "/habits.checkin workout",
    ]);
    expect(r.directives).toEqual({});
  });

  it("ignores blank lines and comments (non-directive #)", () => {
    const src = [
      "# morning ritual",
      "",
      "/journal.today",
      "# pause",
      "/tasks.list",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.lines).toEqual(["/journal.today", "/tasks.list"]);
  });

  it("captures @cron directive", () => {
    const src = ["# @cron 0 8 * * *", "/journal.today"].join("\n");
    const r = parseRitual(src);
    expect(r.directives.cron).toBe("0 8 * * *");
    expect(r.lines).toEqual(["/journal.today"]);
  });

  it("captures @on directive", () => {
    const src = ["# @on app:ready", "/tasks.list"].join("\n");
    const r = parseRitual(src);
    expect(r.directives.on).toBe("app:ready");
  });

  it("captures @halt-on-error directive as boolean", () => {
    const src = ["# @halt-on-error", "/tasks.list"].join("\n");
    const r = parseRitual(src);
    expect(r.directives.haltOnError).toBe(true);
  });

  it("captures multiple directives", () => {
    const src = [
      "# @cron 0 8 * * *",
      "# @halt-on-error",
      "/journal.today",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.directives).toEqual({
      cron: "0 8 * * *",
      haltOnError: true,
    });
  });

  it("trims whitespace and tolerates extra spaces", () => {
    const src = [
      "   # @cron 0 8 * * *   ",
      "   /tasks.list   ",
      "",
    ].join("\n");
    const r = parseRitual(src);
    expect(r.directives.cron).toBe("0 8 * * *");
    expect(r.lines).toEqual(["/tasks.list"]);
  });

  it("returns empty ritual for empty input", () => {
    expect(parseRitual("")).toEqual({ lines: [], directives: {} });
    expect(parseRitual("\n\n\n")).toEqual({ lines: [], directives: {} });
  });

  it("preserves lines without a leading slash", () => {
    // Commands can be invoked with or without / — the REPL strips it.
    // The runner passes lines verbatim to parseCommand which tolerates both.
    const src = "tasks.list";
    expect(parseRitual(src).lines).toEqual(["tasks.list"]);
  });
});
