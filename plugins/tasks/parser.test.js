import { describe, it, expect } from "vitest";
import { parseTasks, serializeTasks, newTaskId } from "./parser.js";

describe("parseTasks", () => {
  it("parses an empty file to an empty list", () => {
    expect(parseTasks("")).toEqual([]);
    expect(parseTasks("\n\n")).toEqual([]);
  });

  it("parses an open task line", () => {
    expect(parseTasks("- [ ] buy milk  ^id-abc")).toEqual([
      { id: "id-abc", done: false, text: "buy milk" },
    ]);
  });

  it("parses a done task line", () => {
    expect(parseTasks("- [x] done thing  ^id-xyz")).toEqual([
      { id: "id-xyz", done: true, text: "done thing" },
    ]);
  });

  it("treats [X] the same as [x]", () => {
    expect(parseTasks("- [X] caps  ^id-1")[0].done).toBe(true);
  });

  it("parses multiple tasks in order", () => {
    const src = [
      "- [ ] first  ^id-1",
      "- [x] second  ^id-2",
      "- [ ] third  ^id-3",
    ].join("\n");
    const parsed = parseTasks(src);
    expect(parsed.map((t) => t.text)).toEqual(["first", "second", "third"]);
    expect(parsed.map((t) => t.done)).toEqual([false, true, false]);
  });

  it("ignores lines that do not match the task pattern", () => {
    const src = [
      "# Inbox",
      "",
      "- [ ] real task  ^id-1",
      "not a task",
    ].join("\n");
    expect(parseTasks(src)).toEqual([
      { id: "id-1", done: false, text: "real task" },
    ]);
  });

  it("tolerates tasks without an id suffix by synthesizing one", () => {
    const [task] = parseTasks("- [ ] no id task");
    expect(task.text).toBe("no id task");
    expect(task.id).toMatch(/^id-/);
    expect(task.id.length).toBeGreaterThan(3);
  });
});

describe("serializeTasks", () => {
  it("is the inverse of parseTasks for canonical input", () => {
    const src = [
      "- [ ] first  ^id-1",
      "- [x] second  ^id-2",
    ].join("\n") + "\n";
    expect(serializeTasks(parseTasks(src))).toBe(src);
  });

  it("emits open tasks with [ ]", () => {
    expect(serializeTasks([{ id: "id-1", done: false, text: "a" }])).toBe(
      "- [ ] a  ^id-1\n",
    );
  });

  it("emits done tasks with [x]", () => {
    expect(serializeTasks([{ id: "id-1", done: true, text: "a" }])).toBe(
      "- [x] a  ^id-1\n",
    );
  });

  it("emits an empty string for an empty list", () => {
    expect(serializeTasks([])).toBe("");
  });
});

describe("newTaskId", () => {
  it("produces ids that start with 'id-'", () => {
    const a = newTaskId();
    expect(a).toMatch(/^id-[a-z0-9]+$/);
  });

  it("produces unique ids", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(newTaskId());
    expect(ids.size).toBe(100);
  });
});
