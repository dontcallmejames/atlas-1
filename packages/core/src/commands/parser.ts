import type { ParsedCommand } from "@atlas/sdk";

/**
 * Parse a REPL command.
 *
 * - leading "/" is optional
 * - tokens are whitespace-separated
 * - double-quoted substrings become one arg with the quotes stripped
 * - an unterminated quote keeps the quote character as a literal
 * - empty or "/" alone -> empty id, empty args
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmedLead = input.startsWith("/") ? input.slice(1) : input;
  if (trimmedLead.trim() === "") {
    return { id: "", args: [], raw: "" };
  }

  const tokens = tokenize(trimmedLead);
  const [id = "", ...args] = tokens;
  return { id, args, raw: trimmedLead };
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    // skip whitespace
    while (i < n && /\s/.test(input[i]!)) i++;
    if (i >= n) break;

    if (input[i] === '"') {
      const start = i;
      i++; // past opening quote
      let buf = "";
      let closed = false;
      while (i < n) {
        if (input[i] === '"') {
          closed = true;
          i++;
          break;
        }
        buf += input[i];
        i++;
      }
      if (closed) {
        out.push(buf);
      } else {
        // unterminated quote -> treat the whole remainder (including the quote) as a token
        out.push(input.slice(start).trimEnd());
        return out;
      }
    } else {
      let buf = "";
      while (i < n && !/\s/.test(input[i]!)) {
        buf += input[i];
        i++;
      }
      out.push(buf);
    }
  }
  return out;
}
