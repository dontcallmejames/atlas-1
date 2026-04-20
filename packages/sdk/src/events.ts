/**
 * Plugins should augment this interface to type their own events:
 *
 *   declare module "@atlas/sdk" {
 *     interface EventMap {
 *       "tasks:completed": { id: string };
 *     }
 *   }
 */
export interface EventMap {
  "app:ready": void;
}

export type EventListener<K extends keyof EventMap> = (
  payload: EventMap[K],
) => void;

export interface EventApi {
  on<K extends keyof EventMap>(event: K, listener: EventListener<K>): () => void;
  off<K extends keyof EventMap>(event: K, listener: EventListener<K>): void;
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
}
