import { describe, it, expect } from "vitest";
import { parseCron, matches } from "./cron-matcher.js";

describe("parseCron", () => {
  it("parses the canonical 5-field form", () => {
    expect(parseCron("0 8 * * *")).toEqual({
      minute: 0,
      hour: 8,
      day: "*",
      month: "*",
      dow: "*",
    });
  });

  it("treats `*` as wildcard", () => {
    expect(parseCron("* * * * *")).toEqual({
      minute: "*",
      hour: "*",
      day: "*",
      month: "*",
      dow: "*",
    });
  });

  it("parses each field as integer when numeric", () => {
    expect(parseCron("30 14 15 6 3")).toEqual({
      minute: 30,
      hour: 14,
      day: 15,
      month: 6,
      dow: 3,
    });
  });

  it("returns null for non-5-field input", () => {
    expect(parseCron("0 8")).toBeNull();
    expect(parseCron("0 8 * * * *")).toBeNull();
    expect(parseCron("")).toBeNull();
  });

  it("returns null for non-numeric / non-wildcard tokens", () => {
    expect(parseCron("a b c d e")).toBeNull();
    expect(parseCron("*/5 * * * *")).toBeNull();
    expect(parseCron("0-15 * * * *")).toBeNull();
  });
});

describe("matches", () => {
  it("matches when the Date lands exactly on a numeric field", () => {
    const expr = parseCron("0 8 * * *")!;
    const d = new Date(2026, 3, 20, 8, 0, 0);
    expect(matches(expr, d)).toBe(true);
  });

  it("does not match when the minute differs", () => {
    const expr = parseCron("0 8 * * *")!;
    const d = new Date(2026, 3, 20, 8, 1, 0);
    expect(matches(expr, d)).toBe(false);
  });

  it("does not match when the hour differs", () => {
    const expr = parseCron("0 8 * * *")!;
    const d = new Date(2026, 3, 20, 9, 0, 0);
    expect(matches(expr, d)).toBe(false);
  });

  it("wildcard matches any value in that field", () => {
    const expr = parseCron("* * * * *")!;
    for (const hh of [0, 7, 23]) {
      for (const mm of [0, 30, 59]) {
        const d = new Date(2026, 3, 20, hh, mm, 0);
        expect(matches(expr, d)).toBe(true);
      }
    }
  });

  it("matches on day-of-month when specified", () => {
    const expr = parseCron("0 0 15 * *")!;
    expect(matches(expr, new Date(2026, 3, 15, 0, 0, 0))).toBe(true);
    expect(matches(expr, new Date(2026, 3, 16, 0, 0, 0))).toBe(false);
  });

  it("matches on month (1-12) when specified", () => {
    const expr = parseCron("0 0 1 6 *")!;
    expect(matches(expr, new Date(2026, 5, 1, 0, 0, 0))).toBe(true); // june is month 5 in Date, 6 in cron
    expect(matches(expr, new Date(2026, 4, 1, 0, 0, 0))).toBe(false);
  });

  it("matches on day-of-week (0-6, Sunday = 0)", () => {
    // 2026-04-20 is a Monday (Date.getDay() === 1)
    const expr = parseCron("0 9 * * 1")!;
    expect(matches(expr, new Date(2026, 3, 20, 9, 0, 0))).toBe(true);
    expect(matches(expr, new Date(2026, 3, 21, 9, 0, 0))).toBe(false); // Tuesday
  });

  it("ignores seconds - only minute resolution matters", () => {
    const expr = parseCron("0 8 * * *")!;
    expect(matches(expr, new Date(2026, 3, 20, 8, 0, 45))).toBe(true);
  });
});
