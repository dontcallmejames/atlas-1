import type { CommandApi } from "@atlas/sdk";
import { parseCommand } from "../commands/parser.js";
import type { Ritual } from "./parser.js";

export interface RunRitualOptions {
  commands: CommandApi;
  /** Named args available as `$name` substitutions in ritual lines. */
  args?: Record<string, string>;
}

/**
 * Replace `$name` references in `line` with values from `args`. Unknown
 * references are left intact.
 */
export function substituteArgs(line: string, args: Record<string, string>): string {
  return line.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (whole, name: string) => {
    return Object.prototype.hasOwnProperty.call(args, name) ? args[name]! : whole;
  });
}

/**
 * Execute a parsed ritual. Each line is substituted for `$args`, parsed via
 * the normal command parser, and invoked. If the ritual's `haltOnError`
 * directive is set, the first failing invocation rethrows; otherwise errors
 * are logged and the ritual continues.
 */
export async function runRitual(ritual: Ritual, opts: RunRitualOptions): Promise<void> {
  const { commands, args = {} } = opts;
  const halt = ritual.directives.haltOnError === true;

  for (const raw of ritual.lines) {
    const expanded = substituteArgs(raw, args);
    const parsed = parseCommand(expanded);
    if (!parsed.id) continue;
    try {
      await commands.invoke(parsed.id, parsed.args);
    } catch (err) {
      if (halt) throw err;
      // eslint-disable-next-line no-console
      console.error(`[atlas] ritual line failed: ${expanded}`, err);
    }
  }
}
