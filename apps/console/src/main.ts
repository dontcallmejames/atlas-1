// Atlas 1 - console bootstrap.

const VERSION = "0.1.0";

// eslint-disable-next-line no-console
console.log("main.ts loaded");

function isTauri(): boolean {
  return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";
}

async function boot(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Atlas 1 \u00b7 v${VERSION} \u00b7 booting`);

  if (!isTauri()) {
    // Browser-only preview (Playwright, pnpm dev). No runtime.
    // eslint-disable-next-line no-console
    console.log(`Atlas 1 \u00b7 v${VERSION} \u00b7 booted`);
    return;
  }

  const { createRuntime, ConfigStore } = await import("@atlas/core");
  const { TauriVaultFs } = await import("./core/tauri-vault-fs.js");
  const { initShell } = await import("./shell/index.js");
  const { showScreen } = await import("./shell/core-commands.js");

  const vault = new TauriVaultFs();
  let vaultRoot = await vault.getVaultRoot();

  // Fast path: Rust may not have the root set this session, but we saved it
  // in localStorage after onboarding. Restore if available.
  if (!vaultRoot) {
    const cached = (() => {
      try { return localStorage.getItem("atlas1c-vault") ?? ""; } catch { return ""; }
    })();
    if (cached) {
      await vault.setVaultRoot(cached);
      vaultRoot = cached;
    }
  }

  if (!vaultRoot) {
    // First run: no Rust root, no cached path. Run the onboarding wizard.
    const { runOnboardingAndBoot } = await import("./onboarding/boot.js");
    const tempConfig = new ConfigStore(vault);
    // Don't await tempConfig.load() - no vault root yet, would throw. Store
    // starts with DEFAULT_CONFIG and is populated by the wizard.

    await runOnboardingAndBoot(vault, tempConfig, async () => {
      const rt = await createRuntime({ vault, vaultRoot: tempConfig.get().vaultPath });
      await rt.load();
      const { loadBuiltInPlugins } = await import("./boot/built-in-plugins.js");
      await loadBuiltInPlugins(rt);
      await initShell(rt);
      // Start the ritual cron scheduler (1-minute tick).
      window.setInterval(() => {
        void rt.rituals.tick();
      }, 60_000);
      // App is fully wired; fire the ready event so @on app:ready rituals can run.
      rt.events.emit("app:ready", undefined);
      try { localStorage.setItem("atlas1c-vault", tempConfig.get().vaultPath); } catch { /* ignore */ }
      showScreen("home");
      // eslint-disable-next-line no-console
      console.log(`Atlas 1 \u00b7 v${VERSION} \u00b7 booted`);
      return rt;
    });
    return;
  }

  // Normal boot - vault root exists.
  const runtime = await createRuntime({ vault, vaultRoot });
  await runtime.load();
  const { loadBuiltInPlugins } = await import("./boot/built-in-plugins.js");
  await loadBuiltInPlugins(runtime);
  await initShell(runtime);
  // Start the ritual cron scheduler (1-minute tick).
  window.setInterval(() => {
    void runtime.rituals.tick();
  }, 60_000);
  // App is fully wired; fire the ready event so @on app:ready rituals can run.
  runtime.events.emit("app:ready", undefined);
  try { localStorage.setItem("atlas1c-vault", vaultRoot); } catch { /* ignore */ }

  if (!runtime.config.get().onboarded) {
    // Edge: vault set but config says not-onboarded. Run wizard.
    const { initOnboarding } = await import("./onboarding/boot.js");
    initOnboarding({
      config: runtime.config,
      vault,
      onComplete: async () => {
        await runtime.config.save();
        showScreen("home");
      },
    });
  } else {
    showScreen("home");
  }

  // eslint-disable-next-line no-console
  console.log(`Atlas 1 \u00b7 v${VERSION} \u00b7 booted`);
}

window.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("atlas boot failed:", err);
  });
});
