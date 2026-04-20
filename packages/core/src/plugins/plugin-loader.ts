import type { Plugin, PluginContext } from "@atlas/sdk";
import type { CoreHandles } from "./context-factory.js";
import { createContext } from "./context-factory.js";

export interface PluginsJsonEntry {
  id: string;
  enabled: boolean;
  /** absolute or vault-relative path to the plugin folder */
  path: string;
  version?: string;
}

export interface PluginsJson {
  plugins: PluginsJsonEntry[];
}

export interface LoadedPlugin {
  id: string;
  plugin: Plugin;
  context: PluginContext;
}

export interface PluginLoaderOptions {
  /** absolute path to the vault root, used to resolve relative plugin paths */
  vaultRoot: string;
  core: CoreHandles;
}

export class PluginLoader {
  private readonly loaded = new Map<string, LoadedPlugin>();

  constructor(private readonly options: PluginLoaderOptions) {}

  async loadAll(): Promise<LoadedPlugin[]> {
    const manifest = await this.readManifest();
    const out: LoadedPlugin[] = [];
    for (const entry of manifest.plugins) {
      if (!entry.enabled) continue;
      const loaded = await this.loadOne(entry);
      if (loaded) out.push(loaded);
    }
    return out;
  }

  async unloadAll(): Promise<void> {
    for (const { id, plugin, context } of [...this.loaded.values()]) {
      try {
        await plugin.onunload?.(context);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[atlas] plugin "${id}" onunload threw:`, err);
      }
      this.loaded.delete(id);
    }
  }

  get(id: string): LoadedPlugin | undefined {
    return this.loaded.get(id);
  }

  private async readManifest(): Promise<PluginsJson> {
    if (!(await this.options.core.vault.exists(".atlas/plugins.json"))) {
      return { plugins: [] };
    }
    const raw = await this.options.core.vault.read(".atlas/plugins.json");
    return JSON.parse(raw) as PluginsJson;
  }

  private async loadOne(entry: PluginsJsonEntry): Promise<LoadedPlugin | null> {
    // Lazy-import Node built-ins so the webview bundle (browser/Tauri) does
    // not pull them in at module-evaluation time. Plugin loading itself is
    // only meaningful in a Node/Tauri runtime, not in the browser preview.
    const { pathToFileURL } = await import("node:url");
    const { resolve } = await import("node:path");
    const mainPath = resolve(this.options.vaultRoot, entry.path, "main.js");
    const moduleUrl = pathToFileURL(mainPath).href;
    let mod: { default: new () => Plugin };
    try {
      mod = (await import(moduleUrl)) as { default: new () => Plugin };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[atlas] failed to import plugin "${entry.id}" at ${mainPath}:`,
        err,
      );
      return null;
    }
    if (typeof mod.default !== "function") {
      // eslint-disable-next-line no-console
      console.error(`[atlas] plugin "${entry.id}" has no default class export`);
      return null;
    }
    const plugin = new mod.default();
    const context = createContext({ pluginId: entry.id, core: this.options.core });
    try {
      await plugin.onload(context);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[atlas] plugin "${entry.id}" onload threw:`, err);
      return null;
    }
    const loaded: LoadedPlugin = { id: entry.id, plugin, context };
    this.loaded.set(entry.id, loaded);
    return loaded;
  }
}
