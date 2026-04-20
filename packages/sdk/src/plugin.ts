import type { CommandApi } from "./commands.js";
import type { EventApi } from "./events.js";
import type { VaultFs } from "./vault.js";
import type { XpApi } from "./xp.js";

/**
 * Nav API — register entries in the app's screen navigation.
 *
 * Stub surface in M2 (core records registrations); M3 wires it to real UI.
 * Disposer returned from `register` removes the item.
 */
export interface NavApi {
  /**
   * Register a nav item. `id` must be unique across plugins; `label` is the
   * visible text; `icon` is an optional glyph/URL; `group` optionally slots
   * the item under a named section. Returns a disposer that removes it.
   */
  register(item: { id: string; label: string; icon?: string; group?: string }): () => void;
}

/**
 * UI API — register lazy-loaded views for named screens.
 *
 * Stub surface in M2; M3 wires it to the view host. Disposer returned from
 * `registerView` removes the registration.
 */
export interface UiApi {
  /**
   * Register a view loader for a screen. `screenId` is the target screen
   * (e.g. `"tasks"`); `loader` is an async factory that resolves to a view
   * module. By convention the loaded module exposes
   * `{ render(el: HTMLElement): void; dispose?(): void }`. Returns a
   * disposer that unregisters the view.
   */
  registerView(screenId: string, loader: () => Promise<unknown>): () => void;
}

/**
 * Runtime handle passed to every plugin lifecycle hook. Plugins should only
 * touch the runtime through this context — do not import core modules
 * directly. Each capability API is documented on its own type.
 */
export interface PluginContext {
  /** The plugin's id as declared in `manifest.json`. Used for namespacing. */
  readonly pluginId: string;
  /** Filesystem scoped to `plugins/<pluginId>/` inside the vault. */
  readonly vault: VaultFs;
  /** Register, unregister, and invoke slash commands. */
  readonly commands: CommandApi;
  /** Subscribe to and emit typed app-wide events. */
  readonly events: EventApi;
  /** Award XP and read HUD state (hp/nrg/focus/streak/level). */
  readonly xp: XpApi;
  /** Add entries to the screen navigation. */
  readonly nav: NavApi;
  /** Register views for named screens. */
  readonly ui: UiApi;
}

/**
 * The Plugin interface. Default-export a class implementing this from
 * your `main.js`. The runtime instantiates it once per app lifetime.
 */
export interface Plugin {
  /**
   * Called once after the plugin instance is constructed. Register commands,
   * views, nav items, and event listeners here. May be async. The ctx is the
   * only way to touch the runtime — do not import core modules directly.
   */
  onload(ctx: PluginContext): Promise<void> | void;

  /**
   * Called once at shutdown. Optional. Release any external resources
   * (timers, fetch aborts, DOM listeners on `window`). Disposers returned
   * by `commands.register`, `nav.register`, `ui.registerView` are called
   * automatically — you do not need to unregister them here.
   */
  onunload?(ctx: PluginContext): Promise<void> | void;
}

/**
 * Shape of `plugins/<id>/manifest.json`. The loader validates this file
 * before instantiating the plugin.
 */
export interface PluginManifest {
  /** Stable id, also the directory name. Matches `/^[a-z][a-z0-9_-]{1,31}$/`. */
  id: string;
  /** Human-readable name shown in Settings. */
  name: string;
  /** Semver string for this plugin release. */
  version: string;
  /** Optional author attribution. */
  author?: string;
  /** Semver range of the Atlas core this plugin targets (e.g. `"^0.10.0"`). */
  atlas: string;
  /** Entry file relative to the plugin directory, usually `"main.js"`. */
  main: string;
  /** Advisory permission strings (e.g. `"vault:plugins/<id>"`). */
  permissions?: string[];
}
