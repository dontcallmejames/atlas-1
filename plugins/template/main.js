/**
 * @typedef {import("@atlas/sdk").Plugin} Plugin
 * @typedef {import("@atlas/sdk").PluginContext} PluginContext
 */

/**
 * Minimal Atlas 1 plugin. Copy this folder and edit main.js.
 *
 * Shows the four capabilities most plugins use:
 *   - ctx.commands.register  — slash commands
 *   - ctx.xp.award           — drip XP on user actions
 *   - ctx.vault.write        — persist plaintext to the scoped vault
 *   - ctx.events.on          — react to app-wide events
 */
export default class TemplatePlugin {
  /** @param {PluginContext} ctx */
  async onload(ctx) {
    // 1. Register a slash command. The `id` is auto-namespaced: the user
    //    types `/<plugin-id>.hello` in the command bar. Do NOT include a dot.
    const offHello = ctx.commands.register({
      id: "hello",
      hint: "log a friendly message, award 10 xp, and append to greetings.md",
      run: async () => {
        const line = `hi from ${ctx.pluginId} · ${new Date().toISOString()}\n`;
        await ctx.vault.append("greetings.md", line);
        ctx.xp.award({ amount: 10, reason: "said hello", kind: "xp" });
      },
    });

    // 2. Subscribe to an event.
    const offReady = ctx.events.on("app:ready", () => {
      // eslint-disable-next-line no-console
      console.log(`[${ctx.pluginId}] app ready`);
    });

    // 3. Stash the disposers so we can clean up on unload.
    this._disposers = [offHello, offReady];
  }

  /** @param {PluginContext} _ctx */
  async onunload(_ctx) {
    for (const off of this._disposers ?? []) off();
  }
}
