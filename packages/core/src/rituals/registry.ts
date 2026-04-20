import type { CommandApi, EventMap, VaultFs } from "@atlas/sdk";
import type { EventBus } from "../events/event-bus.js";
import { parseCron, matches, type CronExpr } from "../cron/cron-matcher.js";
import { parseRitual, type Ritual } from "./parser.js";
import { runRitual } from "./runner.js";
import { DEFAULT_RITUALS } from "./defaults.js";

const RITUALS_DIR = ".atlas/rituals";

interface LoadedRitual {
  name: string;
  ritual: Ritual;
  cron: CronExpr | null;
}

/**
 * Loads ritual files from the vault, seeds defaults on first run, wires
 * event-based triggers to the event bus, and provides a `tick(now)` entry
 * point the app calls every minute for cron-based triggers.
 */
export class RitualRegistry {
  private rituals = new Map<string, LoadedRitual>();
  private eventUnsubs: Array<() => void> = [];
  private lastCronTick: string | null = null;

  constructor(
    private readonly vault: VaultFs,
    private readonly commands: CommandApi,
    private readonly events: EventBus,
  ) {}

  async load(): Promise<void> {
    await this.seedIfEmpty();

    const files = await this.vault.list(RITUALS_DIR);
    this.rituals.clear();
    this.disposeEventSubs();

    for (const file of files) {
      if (!file.endsWith(".atlas")) continue;
      const name = file.slice(0, -".atlas".length);
      const source = await this.vault.read(`${RITUALS_DIR}/${file}`);
      const ritual = parseRitual(source);
      const cron = ritual.directives.cron ? parseCron(ritual.directives.cron) : null;
      this.rituals.set(name, { name, ritual, cron });

      if (ritual.directives.on) {
        const event = ritual.directives.on as keyof EventMap;
        const off = this.events.on(event, () => {
          void this.runRitual(name);
        });
        this.eventUnsubs.push(off);
      }
    }
  }

  listRituals(): string[] {
    return [...this.rituals.keys()];
  }

  async runRitual(name: string, args: Record<string, string> = {}): Promise<void> {
    const entry = this.rituals.get(name);
    if (!entry) return;
    await runRitual(entry.ritual, { commands: this.commands, args });
  }

  /** Call once per minute (or on any cadence — deduped per clock-minute). */
  async tick(now: Date = new Date()): Promise<void> {
    const key = minuteKey(now);
    if (key === this.lastCronTick) return;
    this.lastCronTick = key;
    for (const entry of this.rituals.values()) {
      if (!entry.cron) continue;
      if (matches(entry.cron, now)) {
        await this.runRitual(entry.name);
      }
    }
  }

  dispose(): void {
    this.disposeEventSubs();
    this.rituals.clear();
  }

  private disposeEventSubs(): void {
    for (const off of this.eventUnsubs) off();
    this.eventUnsubs = [];
  }

  private async seedIfEmpty(): Promise<void> {
    for (const [name, body] of Object.entries(DEFAULT_RITUALS)) {
      const path = `${RITUALS_DIR}/${name}`;
      if (!(await this.vault.exists(path))) {
        await this.vault.write(path, body);
      }
    }
  }
}

function minuteKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}
