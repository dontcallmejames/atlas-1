import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./event-bus.js";

describe("EventBus", () => {
  it("delivers a payload to a subscriber", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on("app:ready", listener);
    bus.emit("app:ready", undefined);
    expect(listener).toHaveBeenCalledWith(undefined);
  });

  it("supports multiple subscribers", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("app:ready", a);
    bus.on("app:ready", b);
    bus.emit("app:ready", undefined);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("on() returns an unsubscribe fn", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const off = bus.on("app:ready", listener);
    off();
    bus.emit("app:ready", undefined);
    expect(listener).not.toHaveBeenCalled();
  });

  it("off() removes a specific listener", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("app:ready", a);
    bus.on("app:ready", b);
    bus.off("app:ready", a);
    bus.emit("app:ready", undefined);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("isolates errors — a throwing listener does not block siblings", () => {
    const bus = new EventBus();
    const error = new Error("boom");
    const good = vi.fn();
    bus.on("app:ready", () => {
      throw error;
    });
    bus.on("app:ready", good);
    // swallow the error channel; we assert the good listener still ran
    expect(() => bus.emit("app:ready", undefined)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("emitting with no subscribers is a no-op", () => {
    const bus = new EventBus();
    expect(() => bus.emit("app:ready", undefined)).not.toThrow();
  });
});
