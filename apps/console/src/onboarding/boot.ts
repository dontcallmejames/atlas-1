import type { ConfigStore, Runtime } from "@atlas/core";
import type { TauriVaultFs } from "../core/tauri-vault-fs.js";
import { showScreen } from "../shell/core-commands.js";

export interface BootDeps {
  config: ConfigStore;
  vault: TauriVaultFs;
  onComplete: () => Promise<void>;
}

/**
 * Drive the prototype's onboarding wizard. DOM structure:
 *
 *   #onbStepper > .onb-step[data-step="0".."5"]  (labels 01..06; .active on current, .done on earlier)
 *   .ask.onb-panel[data-step="0".."5"]           (display:none except .active)
 *   #onbPrev / #onbNext / #onbGo                 (go shown only on last step)
 *   #onbProg                                     (text "NN / 06")
 *   #bootName                                    (instance-name input)
 *   .class-card[data-class]                      (loadout cards; .pick marks the chosen one)
 *
 * The prototype does not include a dedicated vault-picker control in any panel,
 * so we open the Tauri folder dialog when the user clicks BOOT ATLAS\u00b71 if no
 * vault path has been set yet.
 */
export function initOnboarding(deps: BootDeps): () => void {
  const { config, vault, onComplete } = deps;

  showScreen("boot");

  const panels = Array.from(
    document.querySelectorAll<HTMLElement>(".onb-panel[data-step]"),
  ).sort((a, b) => Number(a.dataset.step) - Number(b.dataset.step));
  const stepperBtns = Array.from(
    document.querySelectorAll<HTMLElement>("#onbStepper .onb-step[data-step]"),
  );
  const prevBtn = document.getElementById("onbPrev");
  const nextBtn = document.getElementById("onbNext");
  const goBtn = document.getElementById("onbGo");
  const prog = document.getElementById("onbProg");

  const total = panels.length || 6;
  let current = 0; // zero-indexed

  const pad2 = (n: number): string => String(n).padStart(2, "0");

  const setStep = (n: number): void => {
    current = Math.max(0, Math.min(total - 1, n));
    panels.forEach((p) => p.classList.toggle("active", Number(p.dataset.step) === current));
    stepperBtns.forEach((b) => {
      const s = Number(b.dataset.step);
      b.classList.toggle("active", s === current);
      b.classList.toggle("done", s < current);
    });
    if (prog) prog.textContent = `${pad2(current + 1)} / ${pad2(total)}`;
    if (prevBtn) prevBtn.toggleAttribute("disabled", current === 0);
    const isLast = current === total - 1;
    if (nextBtn) nextBtn.style.display = isLast ? "none" : "";
    if (goBtn) goBtn.style.display = isLast ? "" : "none";
  };

  setStep(0);

  const onPrev = (): void => setStep(current - 1);
  const onNext = (): void => setStep(current + 1);

  stepperBtns.forEach((b) => {
    const n = Number(b.dataset.step);
    if (!Number.isNaN(n)) {
      b.addEventListener("click", () => setStep(n));
      b.style.cursor = "pointer";
    }
  });

  prevBtn?.addEventListener("click", onPrev);
  nextBtn?.addEventListener("click", onNext);

  const nameInput = document.getElementById("bootName") as HTMLInputElement | null;
  if (nameInput) {
    // Seed config with the default value so the instance name is stable
    // even if the user never edits the field.
    config.update({ name: nameInput.value });
    nameInput.addEventListener("input", () => {
      config.update({ name: nameInput.value });
    });
  }

  const classCards = document.querySelectorAll<HTMLElement>(".class-card[data-class]");
  const prePicked = document.querySelector<HTMLElement>(".class-card.pick[data-class]");
  if (prePicked?.dataset.class) config.update({ operator: prePicked.dataset.class });
  classCards.forEach((card) => {
    card.addEventListener("click", () => {
      classCards.forEach((c) => c.classList.remove("pick"));
      card.classList.add("pick");
      const cls = card.dataset.class;
      if (cls) config.update({ operator: cls });
    });
  });

  // Mod chips are visual-only for v1 (plugin install lands in M7). Let them
  // toggle so the UI feels responsive, but we do not persist their state.
  document.querySelectorAll<HTMLElement>(".mod-chip").forEach((chip) => {
    chip.addEventListener("click", () => chip.classList.toggle("on"));
  });

  const onGo = async (): Promise<void> => {
    if (goBtn) goBtn.toggleAttribute("disabled", true);
    try {
      let path = config.get().vaultPath;
      if (!path) {
        const { pickVaultFolder } = await import("../core/pick-vault-folder.js");
        const picked = await pickVaultFolder();
        if (!picked) return;
        path = picked;
        config.update({ vaultPath: path });
      }
      await vault.setVaultRoot(path);
      config.update({ onboarded: true });
      await config.save();
      await onComplete();
    } finally {
      if (goBtn) goBtn.toggleAttribute("disabled", false);
    }
  };
  goBtn?.addEventListener("click", () => void onGo());

  return () => {
    prevBtn?.removeEventListener("click", onPrev);
    nextBtn?.removeEventListener("click", onNext);
    goBtn?.replaceWith(goBtn.cloneNode(true));
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
