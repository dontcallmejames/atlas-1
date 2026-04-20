// Atlas 1 — console bootstrap.

const VERSION = "0.1.0";

// eslint-disable-next-line no-console
console.log("main.ts loaded");

function isTauri(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";
}

async function boot(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Atlas 1 · v${VERSION} · booting`);

  if (!isTauri()) {
    // Browser-only preview mode (e.g. Playwright, `pnpm dev`). No runtime; the
    // prototype's inline scripts still drive the visuals.
    // eslint-disable-next-line no-console
    console.log(`Atlas 1 · v${VERSION} · booted`);
    return;
  }

  // Imports for Tauri-only mode
  const { createRuntime, ConfigStore } = await import("@atlas/core");
  const { TauriVaultFs } = await import("./core/tauri-vault-fs.js");
  const { initShell } = await import("./shell/index.js");

  const vault = new TauriVaultFs();
  let vaultRoot = await vault.getVaultRoot();

  if (!vaultRoot) {
    // First-run or not-yet-set. Task 12 wires this into a proper onboarding
    // flow; for now, just open the dialog directly.
    const { pickVaultFolder } = await import("./core/pick-vault-folder.js");
    const picked = await pickVaultFolder();
    if (!picked) {
      // eslint-disable-next-line no-console
      console.warn("no vault selected — boot aborted");
      return;
    }
    await vault.setVaultRoot(picked);
    vaultRoot = picked;
  }

  // Now that the vault root is set we can load config.
  const config = new ConfigStore(vault);
  await config.load();

  const runtime = await createRuntime({ vault, vaultRoot });
  await runtime.load();

  await initShell(runtime);

  // eslint-disable-next-line no-console
  console.log(`Atlas 1 · v${VERSION} · booted`);
}

window.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("atlas boot failed:", err);
  });
});
