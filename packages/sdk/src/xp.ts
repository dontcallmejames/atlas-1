export interface XpEvent {
  /** ms since epoch */
  ts: number;
  /** plugin id or "core" */
  source: string;
  /** positive or negative delta */
  delta: number;
  reason: string;
  /** which stat moved: xp (default), hp, nrg, focus */
  kind?: "xp" | "hp" | "nrg" | "focus";
}

export interface XpState {
  xp: number;
  lvl: number;
  hp: number;
  nrg: number;
  focus: number;
  /** current consecutive-day streak based on daily XP events */
  streak: number;
}

export interface XpApi {
  award(input: { amount: number; reason: string; kind?: XpEvent["kind"] }): void;
  getState(): XpState;
  onChange(listener: (state: XpState) => void): () => void;
}
