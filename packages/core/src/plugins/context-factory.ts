import type {
  CommandApi,
  EventApi,
  PluginContext,
  VaultFs,
} from "@atlas/sdk";
import type { CommandRegistry } from "../commands/command-registry.js";
import type { EventBus } from "../events/event-bus.js";
import type { XpStore } from "../xp/xp-store.js";
import { scopeVaultFs } from "../vault/scoped-vault-fs.js";
import { MountRegistry } from "./mount-registry.js";

export interface CoreHandles {
  vault: VaultFs;
  commands: CommandRegistry;
  events: EventBus;
  xp: XpStore;
  mounts: MountRegistry;
}

export function createContext(params: {
  pluginId: string;
  core: CoreHandles;
}): PluginContext {
  const { pluginId, core } = params;
  const scopedVault = scopeVaultFs(core.vault, pluginId);

  const commands: CommandApi = {
    register: (command) => {
      if (command.id.includes(".")) {
        throw new Error(
          `plugin command id must not contain '.': "${command.id}" (plugin "${pluginId}")`,
        );
      }
      const fullId = `${pluginId}.${command.id}`;
      return core.commands.register({ ...command, id: fullId });
    },
    unregister: (id) => core.commands.unregister(`${pluginId}.${id}`),
    invoke: (id, args) => {
      // Prefer the plugin-namespaced form when it exists so plugins can call
      // their own commands by short name (`invoke("add")` → `tasks.add`).
      // Fall back to the raw id so plugins can also call core / other-plugin
      // commands like `invoke("go", ["home"])` without the context rewriting
      // them to `journal.go`.
      if (!id.includes(".")) {
        const namespaced = `${pluginId}.${id}`;
        if (core.commands.has(namespaced)) {
          return core.commands.invoke(namespaced, args);
        }
      }
      return core.commands.invoke(id, args);
    },
    list: () => core.commands.list(),
    has: (id) => {
      if (!id.includes(".")) {
        const namespaced = `${pluginId}.${id}`;
        if (core.commands.has(namespaced)) return true;
      }
      return core.commands.has(id);
    },
  };

  const events: EventApi = core.events;

  return {
    pluginId,
    vault: scopedVault,
    commands,
    events,
    xp: {
      award: ({ amount, reason, kind }) =>
        core.xp.award({ amount, reason, source: pluginId, kind }),
      getState: () => core.xp.getState(),
      onChange: (listener) => core.xp.onChange(listener),
    },
    nav: {
      register: (item) => core.mounts.addNav({ pluginId, ...item }),
    },
    ui: {
      registerView: (screenId, loader) =>
        core.mounts.addView({ pluginId, screenId, loader }),
    },
  };
}
