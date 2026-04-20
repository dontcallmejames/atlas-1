import type { AtlasConfig, VaultFs } from "@atlas/sdk";
import { DEFAULT_CONFIG } from "./defaults.js";

const CONFIG_PATH = ".atlas/config.json";
type Listener = (config: AtlasConfig) => void;

export class ConfigStore {
  private current: AtlasConfig = { ...DEFAULT_CONFIG };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly vault: VaultFs) {}

  async load(): Promise<void> {
    if (!(await this.vault.exists(CONFIG_PATH))) {
      this.current = { ...DEFAULT_CONFIG };
      return;
    }
    const raw = await this.vault.read(CONFIG_PATH);
    const parsed = JSON.parse(raw) as Partial<AtlasConfig>;
    this.current = { ...DEFAULT_CONFIG, ...parsed };
  }

  async save(): Promise<void> {
    await this.vault.write(CONFIG_PATH, JSON.stringify(this.current, null, 2));
  }

  get(): AtlasConfig {
    return this.current;
  }

  update(patch: Partial<AtlasConfig>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of [...this.listeners]) listener(this.current);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
