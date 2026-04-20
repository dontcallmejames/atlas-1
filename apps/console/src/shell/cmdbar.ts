import type { Runtime } from "@atlas/core";
import { parseCommand } from "@atlas/core";

/**
 * Wire the bottom `.cmdbar` input:
 * - pressing "/" from anywhere (except while typing in another input) focuses it
 * - Enter parses + invokes via runtime.commands
 * - Escape blurs
 */
export function initCmdbar(runtime: Runtime): () => void {
  const input = document.querySelector<HTMLInputElement>(".cmdbar .in");
  if (!input) return () => {};

  const onGlobalKey = (e: KeyboardEvent): void => {
    if (e.key !== "/") return;
    const target = e.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
    e.preventDefault();
    input.focus();
  };

  const onKey = async (e: KeyboardEvent): Promise<void> => {
    if (e.key === "Escape") {
      input.blur();
      return;
    }
    if (e.key !== "Enter") return;
    const raw = input.value.trim();
    if (!raw) return;
    input.value = "";
    const parsed = parseCommand(raw);
    if (!parsed.id) return;
    try {
      await runtime.commands.invoke(parsed.id, parsed.args);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  document.addEventListener("keydown", onGlobalKey);
  input.addEventListener("keydown", onKey as unknown as (e: Event) => void);
  return () => {
    document.removeEventListener("keydown", onGlobalKey);
    input.removeEventListener("keydown", onKey as unknown as (e: Event) => void);
  };
}
