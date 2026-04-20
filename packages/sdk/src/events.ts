/**
 * Typed app-wide event map. The core seeds it with `"app:ready"`. Plugins
 * should augment this interface to type their own events:
 *
 *   declare module "@atlas/sdk" {
 *     interface EventMap {
 *       "tasks:completed": { id: string };
 *     }
 *   }
 */
export interface EventMap {
  /** Emitted once after all built-in plugins finish `onload`. */
  "app:ready": void;
}

/**
 * Listener signature for a given event key. The payload type comes from
 * {@link EventMap}.
 */
export type EventListener<K extends keyof EventMap> = (
  payload: EventMap[K],
) => void;

/**
 * Event bus. Accessed via `ctx.events` from a plugin.
 */
export interface EventApi {
  /**
   * Subscribe to an event. Returns a disposer that unsubscribes. Disposers
   * are called automatically when the plugin is unloaded.
   */
  on<K extends keyof EventMap>(event: K, listener: EventListener<K>): () => void;
  /** Unsubscribe a specific listener previously passed to `on`. */
  off<K extends keyof EventMap>(event: K, listener: EventListener<K>): void;
  /** Emit an event to every subscribed listener. Synchronous fan-out. */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
}
