import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";
import { initClock } from "./clock.js";
import { initNav } from "./nav.js";
import { initCmdbar } from "./cmdbar.js";
import { registerCoreCommands } from "./core-commands.js";

export async function initShell(runtime: Runtime): Promise<void> {
  registerCoreCommands(runtime);
  initTheme(runtime);
  initClock();
  initNav(runtime);
  initCmdbar(runtime);
}
