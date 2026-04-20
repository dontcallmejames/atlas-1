import type { CommandApi } from "./commands.js";
import type { EventApi } from "./events.js";
import type { VaultFs } from "./vault.js";
import type { XpApi } from "./xp.js";

/** Minimal stub surfaces the core registers against in M2; M3 wires them to real UI. */
export interface NavApi {
  register(item: { id: string; label: string; icon?: string; group?: string }): () => void;
}
export interface UiApi {
  registerView(screenId: string, loader: () => Promise<unknown>): () => void;
  registerStatuslineSegment(segment: { id: string; render: (state: unknown) => string }): () => void;
}
export interface SettingsApi {
  register(schema: unknown): () => void;
}
export interface ThemeApi {
  currentTokens(): Record<string, string>;
  registerPack(id: string, css: string): () => void;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly vault: VaultFs;
  readonly commands: CommandApi;
  readonly events: EventApi;
  readonly xp: XpApi;
  readonly nav: NavApi;
  readonly ui: UiApi;
  readonly settings: SettingsApi;
  readonly theme: ThemeApi;
}

export interface Plugin {
  onload(ctx: PluginContext): Promise<void> | void;
  onunload?(ctx: PluginContext): Promise<void> | void;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  atlas: string;
  main: string;
  permissions?: string[];
}
