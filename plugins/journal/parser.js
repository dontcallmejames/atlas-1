/**
 * Format a Date as YYYY-MM-DD in local time.
 * @param {Date} d
 * @returns {string}
 */
export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a strict YYYY-MM-DD string into a Date at local midnight.
 * Returns null if the input does not match.
 * @param {string} s
 * @returns {Date | null}
 */
export function parseDate(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/**
 * Convert a Date to the vault-relative daily-note path:
 *   YYYY/MM/YYYY-MM-DD.md
 * @param {Date} d
 * @returns {string}
 */
export function dateToPath(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${y}-${m}-${day}.md`;
}

/**
 * Extract YYYY-MM-DD from a canonical daily-note path.
 * Returns null if the path is not a daily note.
 * @param {string} path
 * @returns {string | null}
 */
export function pathToDate(path) {
  const m = path.match(/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\.md$/);
  return m ? m[3] : null;
}

/**
 * Today's date as YYYY-MM-DD.
 * @returns {string}
 */
export function todayDate() {
  return formatDate(new Date());
}
