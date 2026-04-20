import type { VaultFs, XpEvent, XpState } from "@atlas/sdk";
import { xpToLevel } from "./level-curve.js";

const LOG_PATH = ".atlas/xp.log";
const SNAPSHOT_PATH = ".atlas/xp-state.json";

interface XpStoreOptions {
  base: number;
  gameMode: boolean;
}

type AwardInput = {
  amount: number;
  reason: string;
  source: string;
  kind?: XpEvent["kind"];
};

type Listener = (state: XpState) => void;

interface Snapshot {
  state: XpState;
  lastSeenTs: number;
  lastXpDate: string | null;
}

export class XpStore {
  private state: XpState = emptyState();
  private lastXpDate: string | null = null;
  private lastSeenTs = 0;
  private readonly listeners = new Set<Listener>();
  private writeChain: Promise<void> = Promise.resolve();
  public ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly vault: VaultFs,
    private readonly options: XpStoreOptions,
  ) {}

  async load(): Promise<void> {
    this.state = emptyState();
    this.lastXpDate = null;
    this.lastSeenTs = 0;

    // Fast path: snapshot exists.
    if (await this.vault.exists(SNAPSHOT_PATH)) {
      try {
        const raw = await this.vault.read(SNAPSHOT_PATH);
        const snap = JSON.parse(raw) as Snapshot;
        this.state = snap.state;
        this.lastSeenTs = snap.lastSeenTs;
        this.lastXpDate = snap.lastXpDate;
        for (const l of [...this.listeners]) l(this.state);
        // Kick off async tail replay but do not await.
        this.ready = this.replayTail();
        return;
      } catch {
        // Fall through to full replay on corrupt snapshot.
        this.state = emptyState();
        this.lastXpDate = null;
        this.lastSeenTs = 0;
      }
    }

    // Cold path: full log replay (first boot, or corrupt snapshot).
    await this.replayFromLog(0);
  }

  private async replayTail(): Promise<void> {
    await this.replayFromLog(this.lastSeenTs);
  }

  private async replayFromLog(since: number): Promise<void> {
    if (!(await this.vault.exists(LOG_PATH))) return;
    const raw = await this.vault.read(LOG_PATH);
    let changed = false;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as XpEvent;
        if (event.ts <= since) continue;
        this.apply(event);
        this.lastSeenTs = Math.max(this.lastSeenTs, event.ts);
        changed = true;
      } catch {
        // skip malformed line
      }
    }
    if (changed) for (const l of [...this.listeners]) l(this.state);
  }

  getState(): XpState {
    return this.state;
  }

  award(input: AwardInput): void {
    if (!this.options.gameMode) return;
    const event: XpEvent = {
      ts: Date.now(),
      source: input.source,
      delta: input.amount,
      reason: input.reason,
      kind: input.kind ?? "xp",
    };
    this.apply(event);
    this.lastSeenTs = Math.max(this.lastSeenTs, event.ts);
    const line = JSON.stringify(event) + "\n";
    this.writeChain = this.writeChain.then(() => this.vault.append(LOG_PATH, line));
    for (const l of [...this.listeners]) l(this.state);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Wait for all queued writes to complete, then snapshot state. */
  async flush(): Promise<void> {
    await this.writeChain;
    const snap: Snapshot = {
      state: this.state,
      lastSeenTs: this.lastSeenTs,
      lastXpDate: this.lastXpDate,
    };
    await this.vault.write(SNAPSHOT_PATH, JSON.stringify(snap));
  }

  private apply(event: XpEvent): void {
    const kind = event.kind ?? "xp";
    const next = { ...this.state };
    if (kind === "xp") {
      next.xp = Math.max(0, next.xp + event.delta);
      next.lvl = xpToLevel(next.xp, this.options.base);
      const today = ymdLocal(event.ts);
      if (this.lastXpDate === null) {
        next.streak = 1;
      } else if (this.lastXpDate === today) {
        // same day, streak unchanged
      } else {
        const prev = new Date(this.lastXpDate + "T00:00:00");
        const curr = new Date(today + "T00:00:00");
        const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
        next.streak = diff === 1 ? next.streak + 1 : 1;
      }
      this.lastXpDate = today;
    } else if (kind === "hp") {
      next.hp = clamp(event.delta >= 0 && event.delta <= 100 ? event.delta : next.hp + event.delta);
    } else if (kind === "nrg") {
      next.nrg = clamp(event.delta >= 0 && event.delta <= 100 ? event.delta : next.nrg + event.delta);
    } else if (kind === "focus") {
      next.focus = clamp(event.delta >= 0 && event.delta <= 100 ? event.delta : next.focus + event.delta);
    }
    this.state = next;
  }
}

function emptyState(): XpState {
  return { xp: 0, lvl: 0, hp: 0, nrg: 0, focus: 0, streak: 0 };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function ymdLocal(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
