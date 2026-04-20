import type { Runtime } from "@atlas/core";
import type { Plugin, PluginContext } from "@atlas/sdk";
import { createContext } from "@atlas/core";

// Vite resolves this at build time to static imports of every main.js under
// plugins/*. Each module's default export is a class implementing Plugin.
// The path is relative to apps/console/src/boot/ — two levels up lands at
// apps/console/, then ../.. from there reaches the repo root's plugins/.
const pluginModules = import.meta.glob("../../plugins/*/main.js", {
  eager: true,
}) as Record<string, { default: new () => Plugin }>;

/**
 * Instantiate every built-in plugin, build a context per plugin, and call
 * its onload. Returns a disposer that calls onunload on all plugins.
 */
export async function loadBuiltInPlugins(runtime: Runtime): Promise<() => Promise<void>> {
  const instances: Array<{ id: string; plugin: Plugin; ctx: PluginContext }> = [];

  for (const [path, mod] of Object.entries(pluginModules)) {
    const id = extractPluginId(path);
    if (!id) continue;
    if (typeof mod.default !== "function") {
      // eslint-disable-next-line no-console
      console.warn(`[atlas] built-in plugin "${id}" has no default export`);
      continue;
    }
    const plugin = new mod.default();
    const ctx = createContext({
      pluginId: id,
      core: {
        vault: runtime.vault,
        commands: runtime.commands,
        events: runtime.events,
        xp: runtime.xp,
        mounts: runtime.mounts,
      },
    });
    try {
      await plugin.onload(ctx);
      instances.push({ id, plugin, ctx });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[atlas] plugin "${id}" onload threw:`, err);
    }
  }

  return async () => {
    for (const { id, plugin, ctx } of instances) {
      try {
        await plugin.onunload?.(ctx);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[atlas] plugin "${id}" onunload threw:`, err);
      }
    }
  };
}

function extractPluginId(path: string): string | null {
  // Expected path ends with "/plugins/<id>/main.js"
  const m = path.match(/\/plugins\/([^/]+)\/main\.js$/);
  return m ? m[1]! : null;
}
