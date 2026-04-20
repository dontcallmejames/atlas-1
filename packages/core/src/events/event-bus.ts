import type { EventApi, EventListener, EventMap } from "@atlas/sdk";

export class EventBus implements EventApi {
  private readonly byEvent = new Map<keyof EventMap, Set<EventListener<keyof EventMap>>>();

  on<K extends keyof EventMap>(event: K, listener: EventListener<K>): () => void {
    let set = this.byEvent.get(event);
    if (!set) {
      set = new Set();
      this.byEvent.set(event, set);
    }
    set.add(listener as EventListener<keyof EventMap>);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: EventListener<K>): void {
    this.byEvent.get(event)?.delete(listener as EventListener<keyof EventMap>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const listeners = this.byEvent.get(event);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        (listener as EventListener<K>)(payload);
      } catch (err) {
        // swallow so one bad subscriber doesn't block others
        // eslint-disable-next-line no-console
        console.error(`[atlas] event listener for "${String(event)}" threw:`, err);
      }
    }
  }
}
