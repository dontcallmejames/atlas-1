import type { Runtime } from "@atlas/core";
import { initTheme } from "./theme.js";

export async function initShell(runtime: Runtime): Promise<void> {
  initTheme(runtime);
}
