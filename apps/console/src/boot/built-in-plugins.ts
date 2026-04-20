import type { Runtime } from "@atlas/core";
import type { Plugin } from "@atlas/sdk";

// Vite resolves this at build time to static imports of every main.js under
// <repo>/plugins/*. Path is relative to this file (apps/console/src/boot/):
// ../ → src/, ../../ → apps/console/, ../../../ → apps/, ../../../../ → repo root.
const pluginModules = import.meta.glob("../../../../plugins/*/main.js", {
  eager: true,
}) as Record<string, { default: new () => Plugin }>;

/**
 * Register every built-in plugin through the runtime's PluginLoader so they
 * go through the same onload/onunload lifecycle as third-party plugins.
 * Returns an aggregate disposer that unloads all built-ins.
 */
export async function loadBuiltInPlugins(runtime: Runtime): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = [];

  for (const [path, mod] of Object.entries(pluginModules)) {
    const id = extractPluginId(path);
    if (!id) continue;
    if (typeof mod.default !== "function") {
      // eslint-disable-next-line no-console
      console.warn(`[atlas] built-in plugin "${id}" has no default export`);
      continue;
    }
    const disposer = await runtime.plugins.addStaticPlugin({
      id,
      pluginClass: mod.default,
    });
    disposers.push(disposer);
  }

  return async () => {
    for (const d of disposers) {
      try {
        await d();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[atlas] built-in plugin disposer threw:`, err);
      }
    }
  };
}

function extractPluginId(path: string): string | null {
  // Expected path ends with "/plugins/<id>/main.js"
  const m = path.match(/\/plugins\/([^/]+)\/main\.js$/);
  return m ? m[1]! : null;
}
