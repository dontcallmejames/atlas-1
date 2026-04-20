import type { VaultFs } from "@atlas/sdk";
import { CommandRegistry } from "./commands/command-registry.js";
import { EventBus } from "./events/event-bus.js";
import { XpStore } from "./xp/xp-store.js";
import { ConfigStore } from "./config/config-store.js";
import { PluginLoader } from "./plugins/plugin-loader.js";

export interface RuntimeOptions {
  vault: VaultFs;
  /** absolute path to the vault root on disk. Used to resolve plugin main.js imports. */
  vaultRoot: string;
}

export interface Runtime {
  vault: VaultFs;
  commands: CommandRegistry;
  events: EventBus;
  xp: XpStore;
  config: ConfigStore;
  plugins: PluginLoader;
  load(): Promise<void>;
  unload(): Promise<void>;
}

export async function createRuntime(options: RuntimeOptions): Promise<Runtime> {
  const { vault, vaultRoot } = options;
  const config = new ConfigStore(vault);
  await config.load();
  const c = config.get();

  const commands = new CommandRegistry();
  const events = new EventBus();
  const xp = new XpStore(vault, { base: c.xpPerLevelBase, gameMode: c.gameMode });
  await xp.load();

  const plugins = new PluginLoader({
    vaultRoot,
    core: { vault, commands, events, xp },
  });

  return {
    vault,
    commands,
    events,
    xp,
    config,
    plugins,
    async load() {
      await plugins.loadAll();
      events.emit("app:ready", undefined);
    },
    async unload() {
      await plugins.unloadAll();
    },
  };
}
