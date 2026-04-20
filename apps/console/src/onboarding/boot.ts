import type { ConfigStore, Runtime } from "@atlas/core";
import type { TauriVaultFs } from "../core/tauri-vault-fs.js";
import { showScreen } from "../shell/core-commands.js";

export interface BootDeps {
  config: ConfigStore;
  vault: TauriVaultFs;
  onComplete: () => Promise<void>;
}

/**
 * Drive the existing boot screen's 6-step wizard. Step elements in the
 * prototype have class `.boot-step` with `data-step="1".."6"`, a stepper
 * with `.stepper [data-step]`, prev/next buttons `#bootPrev`, `#bootNext`,
 * and a `#bootGo` button on step 6.
 */
export function initOnboarding(deps: BootDeps): () => void {
  const { config, vault, onComplete } = deps;

  showScreen("boot");

  const steps = document.querySelectorAll<HTMLElement>(".boot-step");
  const prevBtn = document.getElementById("bootPrev");
  const nextBtn = document.getElementById("bootNext");
  const goBtn = document.getElementById("bootGo");
  const counter = document.getElementById("bootCounter");
  const stepperBtns = document.querySelectorAll<HTMLElement>(".stepper [data-step]");

  let current = 1;
  const total = steps.length || 6;

  const setStep = (n: number): void => {
    current = Math.max(1, Math.min(total, n));
    steps.forEach((s) => s.classList.toggle("on", s.dataset.step === String(current)));
    stepperBtns.forEach((b) => b.classList.toggle("on", b.dataset.step === String(current)));
    if (counter) counter.textContent = `${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    if (prevBtn) prevBtn.toggleAttribute("disabled", current === 1);
    if (nextBtn) nextBtn.textContent = current === total ? "BOOT ATLAS\u00b71" : "next \u2192";
    if (goBtn) goBtn.style.display = current === total ? "" : "none";
  };

  setStep(1);

  const onPrev = (): void => setStep(current - 1);
  const onNext = (): void => {
    if (current === total) void finish();
    else setStep(current + 1);
  };

  stepperBtns.forEach((b) => {
    const n = Number(b.dataset.step);
    if (!Number.isNaN(n)) b.addEventListener("click", () => setStep(n));
  });

  prevBtn?.addEventListener("click", onPrev);
  nextBtn?.addEventListener("click", onNext);

  const nameInput = document.getElementById("bootName") as HTMLInputElement | null;
  nameInput?.addEventListener("input", () => {
    config.update({ name: nameInput.value });
  });

  const classCards = document.querySelectorAll<HTMLElement>(".class-card[data-class]");
  classCards.forEach((card) => {
    card.addEventListener("click", () => {
      classCards.forEach((c) => c.classList.remove("on"));
      card.classList.add("on");
      const cls = card.dataset.class;
      if (cls) config.update({ operator: cls });
    });
  });

  const modChips = document.querySelectorAll<HTMLElement>(".mod-chip[data-mod]");
  modChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("on");
    });
  });

  const bootTheme = document.getElementById("boot-theme") as HTMLSelectElement | null;
  bootTheme?.addEventListener("change", () => {
    const v = bootTheme.value;
    if (v === "light" || v === "dark") config.update({ theme: v });
  });
  const bootCrt = document.getElementById("boot-crt") as HTMLInputElement | null;
  bootCrt?.addEventListener("change", () => config.update({ crt: bootCrt.checked }));
  const bootDensity = document.getElementById("boot-density") as HTMLSelectElement | null;
  bootDensity?.addEventListener("change", () => {
    const v = bootDensity.value;
    if (v === "comfy" || v === "compact") config.update({ density: v });
  });
  document.querySelectorAll<HTMLElement>(".boot-accent[data-c]").forEach((b) => {
    b.addEventListener("click", () => {
      const hex = b.dataset.c;
      if (hex) config.update({ accent: hex });
    });
  });

  const pickBtn = document.getElementById("bootPickVault");
  const vaultPathOut = document.getElementById("bootVaultPath");
  pickBtn?.addEventListener("click", async () => {
    const { pickVaultFolder } = await import("../core/pick-vault-folder.js");
    const picked = await pickVaultFolder();
    if (picked) {
      config.update({ vaultPath: picked });
      if (vaultPathOut) vaultPathOut.textContent = picked;
    }
  });

  async function finish(): Promise<void> {
    const { vaultPath } = config.get();
    if (!vaultPath) {
      setStep(5);
      return;
    }
    await vault.setVaultRoot(vaultPath);
    config.update({ onboarded: true });
    await config.save();
    await onComplete();
  }

  return () => {
    prevBtn?.removeEventListener("click", onPrev);
    nextBtn?.removeEventListener("click", onNext);
  };
}

/** Convenience wrapper - after onboarding completes, continue to the shell. */
export async function runOnboardingAndBoot(
  vault: TauriVaultFs,
  config: ConfigStore,
  boot: () => Promise<Runtime>,
): Promise<Runtime> {
  return new Promise<Runtime>((resolve, reject) => {
    initOnboarding({
      config,
      vault,
      onComplete: async () => {
        try {
          const runtime = await boot();
          resolve(runtime);
        } catch (err) {
          reject(err as Error);
        }
      },
    });
  });
}
