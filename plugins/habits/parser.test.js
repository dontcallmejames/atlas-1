import { describe, it, expect } from "vitest";
import {
  parseHabits,
  serializeHabits,
  parseLog,
  serializeLogEntry,
  streakFor,
  todayDate,
  defaultHabits,
} from "./parser.js";

describe("parseHabits", () => {
  it("parses a YAML habits file", () => {
    const yaml = [
      "habits:",
      "  - id: workout",
      "    name: Workout",
      "    xp: 30",
      "  - id: read",
      "    name: Read 20 min",
      "    xp: 10",
    ].join("\n");
    expect(parseHabits(yaml)).toEqual([
      { id: "workout", name: "Workout", xp: 30 },
      { id: "read", name: "Read 20 min", xp: 10 },
    ]);
  });

  it("returns [] for an empty or missing file", () => {
    expect(parseHabits("")).toEqual([]);
    expect(parseHabits("habits: []")).toEqual([]);
  });

  it("drops entries missing id or name", () => {
    const yaml = [
      "habits:",
      "  - id: ok",
      "    name: Good",
      "    xp: 5",
      "  - name: no id",
      "  - id: no-name",
    ].join("\n");
    expect(parseHabits(yaml).map((h) => h.id)).toEqual(["ok"]);
  });

  it("defaults xp to 10 when missing", () => {
    const yaml = ["habits:", "  - id: a", "    name: A"].join("\n");
    expect(parseHabits(yaml)[0].xp).toBe(10);
  });
});

describe("serializeHabits", () => {
  it("round-trips parse/serialize", () => {
    const habits = [
      { id: "a", name: "A", xp: 10 },
      { id: "b", name: "B", xp: 20 },
    ];
    const yaml = serializeHabits(habits);
    expect(parseHabits(yaml)).toEqual(habits);
  });
});

describe("habits parser (no js-yaml)", () => {
  it("parses the canonical habits.yaml shape", () => {
    const yaml = `habits:
  - id: workout
    name: Workout
    xp: 30
  - id: read
    name: Read 20 min
    xp: 10
`;
    expect(parseHabits(yaml)).toEqual([
      { id: "workout", name: "Workout", xp: 30 },
      { id: "read", name: "Read 20 min", xp: 10 },
    ]);
  });

  it("round-trips parse -> serialize -> parse", () => {
    const habits = [
      { id: "meditate", name: "Meditate", xp: 15 },
      { id: "walk", name: "Evening walk", xp: 10 },
    ];
    expect(parseHabits(serializeHabits(habits))).toEqual(habits);
  });

  it("tolerates blank lines and trailing whitespace", () => {
    const yaml = `habits:
  - id: a
    name: A
    xp: 5

  - id: b
    name: B
    xp: 7
`;
    expect(parseHabits(yaml)).toEqual([
      { id: "a", name: "A", xp: 5 },
      { id: "b", name: "B", xp: 7 },
    ]);
  });
});

describe("parseLog", () => {
  it("parses JSONL entries, one per line", () => {
    const src = [
      '{"ts":1,"habitId":"workout","date":"2026-04-18"}',
      '{"ts":2,"habitId":"workout","date":"2026-04-19"}',
    ].join("\n");
    expect(parseLog(src)).toEqual([
      { ts: 1, habitId: "workout", date: "2026-04-18" },
      { ts: 2, habitId: "workout", date: "2026-04-19" },
    ]);
  });

  it("ignores blank lines and malformed JSON", () => {
    const src = [
      '{"ts":1,"habitId":"a","date":"2026-04-19"}',
      "",
      "not json",
      '{"ts":2,"habitId":"a","date":"2026-04-20"}',
    ].join("\n");
    expect(parseLog(src).map((e) => e.date)).toEqual(["2026-04-19", "2026-04-20"]);
  });
});

describe("serializeLogEntry", () => {
  it("returns a single JSON line with trailing newline", () => {
    const line = serializeLogEntry({ ts: 1, habitId: "a", date: "2026-04-19" });
    expect(line).toBe('{"ts":1,"habitId":"a","date":"2026-04-19"}\n');
  });
});

describe("streakFor", () => {
  it("is 0 when there are no entries", () => {
    expect(streakFor([], "a", "2026-04-20")).toBe(0);
  });

  it("is 1 when only today is checked in", () => {
    const log = [{ ts: 0, habitId: "a", date: "2026-04-20" }];
    expect(streakFor(log, "a", "2026-04-20")).toBe(1);
  });

  it("counts consecutive days back from today", () => {
    const log = [
      { ts: 0, habitId: "a", date: "2026-04-17" },
      { ts: 0, habitId: "a", date: "2026-04-18" },
      { ts: 0, habitId: "a", date: "2026-04-19" },
      { ts: 0, habitId: "a", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(4);
  });

  it("stops at the first gap", () => {
    const log = [
      { ts: 0, habitId: "a", date: "2026-04-17" },
      { ts: 0, habitId: "a", date: "2026-04-19" },
      { ts: 0, habitId: "a", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(2); // 19, 20 — gap before 17
  });

  it("is 0 when today is not checked in and yesterday is", () => {
    const log = [{ ts: 0, habitId: "a", date: "2026-04-19" }];
    expect(streakFor(log, "a", "2026-04-20")).toBe(0);
  });

  it("ignores entries for other habits", () => {
    const log = [
      { ts: 0, habitId: "b", date: "2026-04-19" },
      { ts: 0, habitId: "b", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(0);
  });

  it("deduplicates multiple entries on the same day", () => {
    const log = [
      { ts: 0, habitId: "a", date: "2026-04-19" },
      { ts: 1, habitId: "a", date: "2026-04-19" },
      { ts: 2, habitId: "a", date: "2026-04-20" },
    ];
    expect(streakFor(log, "a", "2026-04-20")).toBe(2);
  });
});

describe("todayDate", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("defaultHabits", () => {
  it("returns a non-empty habit list for first-run vaults", () => {
    expect(defaultHabits().length).toBeGreaterThan(0);
    for (const h of defaultHabits()) {
      expect(h.id).toMatch(/^[a-z0-9-]+$/);
      expect(h.name.length).toBeGreaterThan(0);
      expect(typeof h.xp).toBe("number");
    }
  });
});
