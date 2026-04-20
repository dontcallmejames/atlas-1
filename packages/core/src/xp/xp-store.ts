import type { VaultFs, XpEvent, XpState } from "@atlas/sdk";
import { xpToLevel } from "./level-curve.js";

const LOG_PATH = ".atlas/xp.log";

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

export class XpStore {
  private state: XpState = emptyState();
  private readonly listeners = new Set<Listener>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly vault: VaultFs,
    private readonly options: XpStoreOptions,
  ) {}

  async load(): Promise<void> {
    this.state = emptyState();
    if (!(await this.vault.exists(LOG_PATH))) return;
    const raw = await this.vault.read(LOG_PATH);
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as XpEvent;
        this.apply(event);
      } catch {
        // skip malformed line
      }
    }
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
    const line = JSON.stringify(event) + "\n";
    this.writeChain = this.writeChain.then(() => this.vault.append(LOG_PATH, line));
    for (const l of [...this.listeners]) l(this.state);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Wait for all queued writes to complete. */
  async flush(): Promise<void> {
    await this.writeChain;
  }

  private apply(event: XpEvent): void {
    const kind = event.kind ?? "xp";
    const next = { ...this.state };
    if (kind === "xp") {
      next.xp = Math.max(0, next.xp + event.delta);
      next.lvl = xpToLevel(next.xp, this.options.base);
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
