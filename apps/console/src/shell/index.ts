import type { Runtime } from "@atlas/core";

/** Called by main.ts once the runtime is ready and plugins have loaded. */
export async function initShell(_runtime: Runtime): Promise<void> {
  // Wiring added by Tasks 5–12. For now, the inline prototype scripts still
  // handle visual behavior; these modules incrementally take over each.
}
