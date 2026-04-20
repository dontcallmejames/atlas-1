import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";
import { initNav } from "./nav.js";
import { initCmdbar } from "./cmdbar.js";
import { initStatusline } from "./statusline.js";
import { initTweaks } from "./tweaks.js";
import { initHomeGreeting } from "./home.js";
import { initMountPoints } from "./mount-points.js";
import { registerCoreCommands } from "./core-commands.js";
import { initSettings } from "../settings/settings-router.js";

export async function initShell(runtime: Runtime): Promise<void> {
  registerCoreCommands(runtime);
  initMountPoints(runtime);
  initTheme(runtime);
  initClock();
  initNav(runtime);
  initCmdbar(runtime);
  initStatusline(runtime);
  initTweaks(runtime);
  initHomeGreeting(runtime);
  initSettings(runtime);
}
