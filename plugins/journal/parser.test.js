import { describe, it, expect } from "vitest";
import { dateToPath, pathToDate, formatDate, todayDate, parseDate } from "./parser.js";

describe("formatDate", () => {
  it("formats a Date into YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-04-20T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("zero-pads single-digit month and day", () => {
    const d = new Date(2026, 0, 5); // jan 5, local time
    expect(formatDate(d)).toBe("2026-01-05");
  });
});

describe("parseDate", () => {
  it("parses YYYY-MM-DD into a Date at local midnight", () => {
    const d = parseDate("2026-04-20");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(20);
  });

  it("returns null for malformed input", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("2026-4-1")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("dateToPath", () => {
  it("writes to YYYY/MM/YYYY-MM-DD.md", () => {
    expect(dateToPath(new Date(2026, 3, 20))).toBe("2026/04/2026-04-20.md");
  });

  it("zero-pads the month folder", () => {
    expect(dateToPath(new Date(2026, 0, 5))).toBe("2026/01/2026-01-05.md");
  });
});

describe("pathToDate", () => {
  it("extracts a date from a canonical daily-note path", () => {
    expect(pathToDate("2026/04/2026-04-20.md")).toBe("2026-04-20");
  });

  it("returns null for non-daily-note paths", () => {
    expect(pathToDate("templates/daily.md")).toBeNull();
    expect(pathToDate("not-a-journal-file.md")).toBeNull();
  });
});

describe("todayDate", () => {
  it("returns today's date in YYYY-MM-DD", () => {
    const t = todayDate();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    expect(t).toBe(formatDate(now));
  });
});
