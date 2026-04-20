import yaml from "js-yaml";

/**
 * @typedef {Object} Habit
 * @property {string} id
 * @property {string} name
 * @property {number} xp
 */

/**
 * @typedef {Object} LogEntry
 * @property {number} ts       ms since epoch
 * @property {string} habitId
 * @property {string} date     YYYY-MM-DD (local)
 */

/**
 * Parse habits.yaml.
 * @param {string} source
 * @returns {Habit[]}
 */
export function parseHabits(source) {
  if (!source || !source.trim()) return [];
  let parsed;
  try {
    parsed = yaml.load(source);
  } catch {
    return [];
  }
  const list = (parsed && parsed.habits) || [];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const h of list) {
    if (!h || typeof h !== "object") continue;
    if (typeof h.id !== "string" || typeof h.name !== "string") continue;
    out.push({
      id: h.id,
      name: h.name,
      xp: typeof h.xp === "number" ? h.xp : 10,
    });
  }
  return out;
}

/**
 * Serialize habits back to YAML.
 * @param {Habit[]} habits
 * @returns {string}
 */
export function serializeHabits(habits) {
  return yaml.dump({ habits });
}

/**
 * Parse a JSONL log string.
 * @param {string} source
 * @returns {LogEntry[]}
 */
export function parseLog(source) {
  if (!source) return [];
  const out = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const e = JSON.parse(trimmed);
      if (
        typeof e.ts === "number" &&
        typeof e.habitId === "string" &&
        typeof e.date === "string"
      ) {
        out.push({ ts: e.ts, habitId: e.habitId, date: e.date });
      }
    } catch {
      // skip
    }
  }
  return out;
}

/**
 * Serialize a single log entry as a JSONL line (including trailing newline).
 * @param {LogEntry} entry
 * @returns {string}
 */
export function serializeLogEntry(entry) {
  return JSON.stringify({ ts: entry.ts, habitId: entry.habitId, date: entry.date }) + "\n";
}

/**
 * Compute the current consecutive-day streak for a habit ending at `today`.
 * Returns 0 if `today` is not checked in.
 * @param {LogEntry[]} log
 * @param {string} habitId
 * @param {string} today  YYYY-MM-DD
 * @returns {number}
 */
export function streakFor(log, habitId, today) {
  const dates = new Set(log.filter((e) => e.habitId === habitId).map((e) => e.date));
  if (!dates.has(today)) return 0;
  let streak = 0;
  let cursor = today;
  while (dates.has(cursor)) {
    streak++;
    cursor = prevDate(cursor);
    if (!cursor) break;
  }
  return streak;
}

function prevDate(ymd) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * Today's date as YYYY-MM-DD (local).
 * @returns {string}
 */
export function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Default habit list seeded on first run.
 * @returns {Habit[]}
 */
export function defaultHabits() {
  return [
    { id: "workout", name: "Workout", xp: 30 },
    { id: "read", name: "Read 20 min", xp: 10 },
    { id: "meditate", name: "Meditate", xp: 15 },
    { id: "walk", name: "Evening walk", xp: 10 },
  ];
}
