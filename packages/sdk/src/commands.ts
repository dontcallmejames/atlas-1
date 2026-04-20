export interface ParsedCommand {
  /** namespaced id, e.g. "task.add" or "go" */
  id: string;
  /** positional args after the id */
  args: string[];
  /** the raw input, minus the leading slash if any */
  raw: string;
}

export type CommandHandler = (args: string[]) => void | Promise<void>;

export interface Command {
  /** must be dot-namespaced for plugin commands: "<plugin>.<verb>". Core commands are unprefixed. */
  id: string;
  hint?: string;
  run: CommandHandler;
}

export interface CommandApi {
  register(command: Command): () => void;
  unregister(id: string): void;
  invoke(id: string, args?: string[]): Promise<void>;
  list(): Command[];
  has(id: string): boolean;
}
