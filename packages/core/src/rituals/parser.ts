export interface RitualDirectives {
  /** Cron expression (5-field). If set, the ritual fires on matching minutes. */
  cron?: string;
  /** Event name. If set, the ritual fires when that event is emitted. */
  on?: string;
  /** If true, the runner stops at the first failing command. Default false. */
  haltOnError?: boolean;
}

export interface Ritual {
  /** One entry per executable line. Leading `/` is optional — callers that
   * invoke via the command parser pass each line through unchanged. */
  lines: string[];
  directives: RitualDirectives;
}

const DIRECTIVE_LINE = /^#\s*@([a-z-]+)(?:\s+(.*))?$/;

/**
 * Parse a `.atlas` ritual file.
 *
 *   # comment          (ignored unless it starts with `@`)
 *   # @cron 0 8 * * *  (directive)
 *   # @on app:ready    (directive)
 *   # @halt-on-error   (directive, no argument)
 *   /some.command args
 *   blank lines are ignored
 */
export function parseRitual(source: string): Ritual {
  const lines: string[] = [];
  const directives: RitualDirectives = {};

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;

    if (line.startsWith("#")) {
      const m = line.match(DIRECTIVE_LINE);
      if (m) {
        const [, name, value] = m;
        switch (name) {
          case "cron":
            if (value) directives.cron = value.trim();
            break;
          case "on":
            if (value) directives.on = value.trim();
            break;
          case "halt-on-error":
            directives.haltOnError = true;
            break;
          // Unknown directives are silently ignored.
        }
      }
      continue;
    }

    lines.push(line);
  }

  return { lines, directives };
}
