/**
 * Result of parsing a raw command-bar line into an id + positional args.
 */
export interface ParsedCommand {
  /** namespaced id, e.g. "task.add" or "go" */
  id: string;
  /** positional args after the id */
  args: string[];
  /** the raw input, minus the leading slash if any */
  raw: string;
}

/**
 * A command implementation. Receives positional args parsed from the
 * command bar. May be async.
 */
export type CommandHandler = (args: string[]) => void | Promise<void>;

/**
 * A registrable command. Registered via {@link CommandApi.register}.
 */
export interface Command {
  /**
   * The command id.
   *
   * For plugin commands, register the bare verb (e.g. `"add"`) — the runtime
   * prefixes it with `<pluginId>.` to produce the final command id
   * (`"<pluginId>.add"`). Do not include a dot yourself; an error is thrown
   * if you try.
   *
   * Core commands are unprefixed (e.g. `"go"`).
   */
  id: string;
  /** One-line description shown in the command-bar autocomplete. */
  hint?: string;
  /** The implementation invoked when the command fires. */
  run: CommandHandler;
}

/**
 * Command registry. Accessed via `ctx.commands` from a plugin, or directly
 * from core.
 */
export interface CommandApi {
  /**
   * Register a command. Returns a disposer that unregisters it. Plugins do
   * not normally need to call the disposer — the runtime disposes all
   * plugin-registered commands automatically on unload.
   */
  register(command: Command): () => void;
  /** Remove a command by its final (namespaced) id. */
  unregister(id: string): void;
  /** Invoke a command by its final id, passing optional positional args. */
  invoke(id: string, args?: string[]): Promise<void>;
  /** List every registered command. */
  list(): Command[];
  /** Whether a command with the given final id is registered. */
  has(id: string): boolean;
}
