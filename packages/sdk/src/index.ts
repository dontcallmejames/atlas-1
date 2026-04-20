/**
 * @atlas/sdk — the public plugin authoring contract for Atlas 1.
 *
 * An Atlas plugin is a directory under `plugins/<id>/` with a `main.js` that
 * default-exports a class implementing {@link Plugin}. At load time, the core
 * constructs an instance, calls `onload(ctx)` with a {@link PluginContext},
 * and keeps the instance alive until shutdown, when `onunload(ctx)` is called.
 *
 * The context exposes seven capability APIs:
 *  - `ctx.vault`    — {@link VaultFs} scoped to `plugins/<id>/` (advisory; see CONTRIBUTING.md's "Plugin trust model")
 *  - `ctx.commands` — {@link CommandApi} to register slash commands
 *  - `ctx.events`   — {@link EventApi} to subscribe to and emit app-wide events
 *  - `ctx.xp`       — {@link XpApi} to award XP and read game state
 *  - `ctx.nav`      — {@link NavApi} to add entries to the screen nav
 *  - `ctx.ui`       — {@link UiApi} to register views for screens
 *
 * Start from `plugins/template/` and copy it with `pnpm new:plugin <id>`.
 * See the three built-in plugins (`plugins/tasks`, `plugins/journal`,
 * `plugins/habits`) for fuller patterns.
 */
export * from "./plugin.js";
export * from "./commands.js";
export * from "./events.js";
export * from "./vault.js";
export * from "./xp.js";
export * from "./config.js";
