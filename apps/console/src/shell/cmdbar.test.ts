import { describe, it, expect } from "vitest";
import { createHistory, pushHistory, cycleUp, cycleDown } from "./cmdbar.js";

describe("cmdbar history", () => {
  it("createHistory returns empty state", () => {
    const h = createHistory();
    expect(h.items).toEqual([]);
    expect(h.idx).toBeNull();
  });

  it("pushHistory appends entries and resets idx", () => {
    let h = createHistory();
    h = pushHistory(h, "/tasks.add foo");
    h = pushHistory(h, "/journal.today");
    expect(h.items).toEqual(["/tasks.add foo", "/journal.today"]);
    expect(h.idx).toBeNull();
  });

  it("pushHistory ignores empty entries and dedupes trailing duplicates", () => {
    let h = createHistory();
    h = pushHistory(h, "  ");
    h = pushHistory(h, "/a");
    h = pushHistory(h, "/a");
    expect(h.items).toEqual(["/a"]);
  });

  it("pushHistory caps at 50 entries", () => {
    let h = createHistory();
    for (let i = 0; i < 60; i++) h = pushHistory(h, `/c${i}`);
    expect(h.items.length).toBe(50);
    expect(h.items[0]).toBe("/c10");
    expect(h.items[49]).toBe("/c59");
  });

  it("cycleUp walks from newest to oldest then clamps", () => {
    let h = createHistory();
    h = pushHistory(h, "/one");
    h = pushHistory(h, "/two");
    h = pushHistory(h, "/three");
    let r = cycleUp(h);
    expect(r.value).toBe("/three");
    r = cycleUp(r.state);
    expect(r.value).toBe("/two");
    r = cycleUp(r.state);
    expect(r.value).toBe("/one");
    r = cycleUp(r.state);
    expect(r.value).toBe("/one"); // clamped at oldest
  });

  it("cycleDown returns empty string past newest and is no-op when idx is null", () => {
    let h = createHistory();
    h = pushHistory(h, "/one");
    h = pushHistory(h, "/two");
    // idx null -> cycleDown is no-op
    const noop = cycleDown(h);
    expect(noop.value).toBeNull();
    // walk up twice, then back down
    let r = cycleUp(h); // /two
    r = cycleUp(r.state); // /one
    r = cycleDown(r.state); // /two
    expect(r.value).toBe("/two");
    r = cycleDown(r.state); // past newest -> ""
    expect(r.value).toBe("");
    expect(r.state.idx).toBeNull();
  });

  it("cycleUp on empty history returns null", () => {
    const h = createHistory();
    const r = cycleUp(h);
    expect(r.value).toBeNull();
    expect(r.state).toBe(h);
  });
});
