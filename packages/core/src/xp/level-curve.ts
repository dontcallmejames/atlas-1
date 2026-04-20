/**
 * Triangular curve: lvl N requires N * base total XP to reach.
 * Example: base=500 → lvl 1 at 500 xp, lvl 2 at 1000, lvl 3 at 1500, …
 * Returns the integer level for a given total XP.
 */
export function xpToLevel(xp: number, base: number): number {
  if (xp <= 0 || base <= 0) return 0;
  return Math.floor(xp / base);
}
