import type { Plugin, PluginContext } from "@atlas/sdk";
import type { CoreHandles } from "./context-factory.js";
import { createContext } from "./context-factory.js";
import { loadPluginState, type PluginStateEntry } from "./plugin-state.js";

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

export interface AddStaticPluginOptions {
  id: string;
  pluginClass: new () => Plugin;
  /** Reserved for future manifest validation. Not used yet. */
  manifest?: unknown;
}

const PLUGIN_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export class PluginLoader {
  private readonly loaded = new Map<string, LoadedPlugin>();

  constructor(private readonly options: PluginLoaderOptions) {}

  async loadAll(): Promise<LoadedPlugin[]> {
    const state = await loadPluginState(this.options.core.vault);
    const out: LoadedPlugin[] = [];
    for (const entry of state.plugins) {
      if (!entry.enabled) continue;
      if (!entry.path) continue; // built-ins are registered via addStaticPlugin
      const loaded = await this.loadOne(entry);
      if (loaded) out.push(loaded);
    }
    return out;
  }

  /**
   * Register a built-in (statically imported) plugin through the same
   * lifecycle as third-party plugins. Honors the disabled-state gate from
   * `.atlas/plugins.json`. Returns a disposer that calls `onunload` and
   * removes the plugin from the loaded set. The disposer is a no-op if the
   * plugin was skipped (disabled) or already unloaded.
   */
  async addStaticPlugin(opts: AddStaticPluginOptions): Promise<() => Promise<void>> {
    const { id, pluginClass } = opts;
    if (!PLUGIN_ID_RE.test(id)) {
      throw new Error(
        `[atlas] invalid plugin id "${id}"; must match /^[a-z][a-z0-9_-]{0,31}$/`,
      );
    }
    const state = await loadPluginState(this.options.core.vault);
    const entry = state.plugins.find((p) => p.id === id);
    if (entry && entry.enabled === false) {
      // eslint-disable-next-line no-console
      console.log(`[atlas] built-in plugin "${id}" disabled by .atlas/plugins.json`);
      return async () => {};
    }
    const plugin = new pluginClass();
    const context = createContext({ pluginId: id, core: this.options.core });
    try {
      await plugin.onload(context);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[atlas] plugin "${id}" onload threw:`, err);
      return async () => {};
    }
    const loaded: LoadedPlugin = { id, plugin, context };
    this.loaded.set(id, loaded);
    return async () => {
      if (this.loaded.get(id) !== loaded) return;
      try {
        await plugin.onunload?.(context);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[atlas] plugin "${id}" onunload threw:`, err);
      }
      this.loaded.delete(id);
    };
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

  private async loadOne(entry: PluginStateEntry): Promise<LoadedPlugin | null> {
    if (!PLUGIN_ID_RE.test(entry.id)) {
      // eslint-disable-next-line no-console
      console.error(
        `[atlas] invalid plugin id "${entry.id}"; must match /^[a-z][a-z0-9_-]{0,31}$/`,
      );
      return null;
    }
    // Lazy-import Node built-ins so the webview bundle (browser/Tauri) does
    // not pull them in at module-evaluation time. Plugin loading itself is
    // only meaningful in a Node/Tauri runtime, not in the browser preview.
    const { pathToFileURL } = await import("node:url");
    const { resolve } = await import("node:path");
    const mainPath = resolve(this.options.vaultRoot, entry.path!, "main.js");
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
