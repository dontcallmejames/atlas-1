export type ThemeMode = "light" | "dark";
export type Density = "comfy" | "compact";

export interface AtlasConfig {
  name: string;
  tagline: string;
  operator: string;
  operatorName: string;
  theme: ThemeMode;
  accent: string;
  density: Density;
  fontMono: string;
  crt: boolean;
  gameMode: boolean;
  vaultPath: string;
  onboarded: boolean;
  xpPerLevelBase: number;
  globalShortcut: string | null;
}
