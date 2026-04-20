export { CommandRegistry } from "./commands/command-registry.js";
export { parseCommand } from "./commands/parser.js";
export { EventBus } from "./events/event-bus.js";
export { scopeVaultFs } from "./vault/scoped-vault-fs.js";
// NodeVaultFs is a Node-only driver (imports node:fs/promises). It is not
// re-exported here to keep @atlas/core webview-safe. Import it from the deep
// path in tests and Node tooling:
//   import { NodeVaultFs } from "@atlas/core/src/vault/node-vault-fs.js";
export { ConfigStore } from "./config/config-store.js";
export { DEFAULT_CONFIG } from "./config/defaults.js";
export { XpStore } from "./xp/xp-store.js";
export { xpToLevel } from "./xp/level-curve.js";
export { PluginLoader } from "./plugins/plugin-loader.js";
export { createContext } from "./plugins/context-factory.js";
export { MountRegistry } from "./plugins/mount-registry.js";
export type { NavItem, ScreenView } from "./plugins/mount-registry.js";
export { loadPluginState, savePluginState, setPluginEnabled } from "./plugins/plugin-state.js";
export type { PluginState, PluginStateEntry } from "./plugins/plugin-state.js";
export { createRuntime } from "./runtime.js";
export type { Runtime, RuntimeOptions } from "./runtime.js";
export { RitualRegistry } from "./rituals/registry.js";
export { parseRitual } from "./rituals/parser.js";
export { runRitual } from "./rituals/runner.js";
export type { Ritual, RitualDirectives } from "./rituals/parser.js";
export type { CoreHandles } from "./plugins/context-factory.js";
export type {
  LoadedPlugin,
  PluginLoaderOptions,
  AddStaticPluginOptions,
} from "./plugins/plugin-loader.js";
