/**
 * One XP ledger entry. Appended to `.atlas/xp.jsonl` whenever
 * {@link XpApi.award} is called (unless gameMode is off).
 */
export interface XpEvent {
  /** ms since epoch */
  ts: number;
  /** plugin id or "core" */
  source: string;
  /** positive or negative delta */
  delta: number;
  /** Short human-readable reason, e.g. `"completed task"`. */
  reason: string;
  /** which stat moved: xp (default), hp, nrg, focus */
  kind?: "xp" | "hp" | "nrg" | "focus";
}

/**
 * Snapshot of the HUD game state derived from the XP ledger.
 */
export interface XpState {
  /** Total lifetime XP. */
  xp: number;
  /** Current level, computed from `xp` and `xpPerLevelBase` config. */
  lvl: number;
  /** Health points (0–100). */
  hp: number;
  /** Energy points (0–100). */
  nrg: number;
  /** Focus points (0–100). */
  focus: number;
  /** current consecutive-day streak based on daily XP events */
  streak: number;
}

/**
 * XP / HUD API. Accessed via `ctx.xp` from a plugin.
 *
 * Note: when `gameMode: false` is set in {@link AtlasConfig}, `award` is a
 * no-op — the ledger is not written and listeners are not notified.
 */
export interface XpApi {
  /**
   * Award an XP delta. `amount` may be negative (for penalties). `kind`
   * defaults to `"xp"`; pass `"hp" | "nrg" | "focus"` to move another stat.
   * No-op when `gameMode` is disabled in config.
   */
  award(input: { amount: number; reason: string; kind?: XpEvent["kind"] }): void;
  /** Read the current HUD state snapshot. */
  getState(): XpState;
  /**
   * Subscribe to state changes. Fires after every `award` that mutates
   * state. Returns a disposer.
   */
  onChange(listener: (state: XpState) => void): () => void;
}
