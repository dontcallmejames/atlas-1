export type CronField = number | "*";

export interface CronExpr {
  minute: CronField;
  hour: CronField;
  day: CronField;
  month: CronField;
  dow: CronField;
}

function parseField(s: string): CronField | null {
  if (s === "*") return "*";
  if (!/^\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a 5-field cron expression: `minute hour day month dow`.
 * Each field is `*` or a non-negative integer. Returns null on malformed input.
 */
export function parseCron(source: string): CronExpr | null {
  const tokens = source.trim().split(/\s+/);
  if (tokens.length !== 5) return null;
  const parsed = tokens.map(parseField);
  const mi = parsed[0] ?? null;
  const ho = parsed[1] ?? null;
  const da = parsed[2] ?? null;
  const mo = parsed[3] ?? null;
  const dw = parsed[4] ?? null;
  if (mi === null || ho === null || da === null || mo === null || dw === null) {
    return null;
  }
  return { minute: mi, hour: ho, day: da, month: mo, dow: dw };
}

function fieldMatches(field: CronField, value: number): boolean {
  return field === "*" || field === value;
}

/**
 * Does `d` fall inside the minute that matches `expr`?
 * Seconds are ignored. Month is 1-12 (Date.getMonth is 0-11 so we add 1).
 * Day-of-week is 0-6 with Sunday = 0.
 */
export function matches(expr: CronExpr, d: Date): boolean {
  return (
    fieldMatches(expr.minute, d.getMinutes()) &&
    fieldMatches(expr.hour, d.getHours()) &&
    fieldMatches(expr.day, d.getDate()) &&
    fieldMatches(expr.month, d.getMonth() + 1) &&
    fieldMatches(expr.dow, d.getDay())
  );
}
