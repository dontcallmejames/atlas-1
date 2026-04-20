/** UI theme mode. */
export type ThemeMode = "light" | "dark";
/** UI density preset — `comfy` has more padding, `compact` is tighter. */
export type Density = "comfy" | "compact";

/**
 * User-facing Atlas configuration persisted in `.atlas/config.json`. Every
 * field maps 1:1 to a setting surface (Settings screen or onboarding).
 */
export interface AtlasConfig {
  /** App title shown in the title bar and HUD. */
  name: string;
  /** Short subtitle shown under the app title. */
  tagline: string;
  /** Operator handle (short id, e.g. `"jim"`). */
  operator: string;
  /** Operator display name, e.g. `"Jim Fordham"`. */
  operatorName: string;
  /** Current UI theme mode. */
  theme: ThemeMode;
  /** Accent color as a CSS color string (hex or named). */
  accent: string;
  /** UI density preset. */
  density: Density;
  /** Preferred monospace font-family string applied to the shell. */
  fontMono: string;
  /** Whether the CRT scanline/glow post-effect is enabled. */
  crt: boolean;
  /** Master toggle for the XP/HUD game layer. When false, `xp.award` is a no-op. */
  gameMode: boolean;
  /** Absolute filesystem path to the vault root directory. */
  vaultPath: string;
  /** Whether the first-run onboarding flow has been completed. */
  onboarded: boolean;
  /** XP required to reach level 2; subsequent levels scale from this base. */
  xpPerLevelBase: number;
  /** Global hotkey to toggle the app window, or `null` when unset. */
  globalShortcut: string | null;
}
