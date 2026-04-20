import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";

/**
 * Register a system-wide hotkey that brings Atlas to the foreground and
 * focuses the command bar. The shortcut string uses Tauri's format, e.g.
 * "CommandOrControl+Shift+Space". Pass null/empty to disable.
 *
 * Returns a disposer that unregisters the shortcut.
 */
export async function initGlobalShortcut(
  shortcut: string | null,
): Promise<() => Promise<void>> {
  if (!shortcut) return async () => {};

  try {
    await register(shortcut, async (event) => {
      if (event.state !== "Pressed") return;
      const win = getCurrentWindow();
      try {
        await win.show();
        await win.setFocus();
      } catch {
        // ignore — the window may already be visible and focused
      }
      const input = document.querySelector<HTMLInputElement>(".cmdbar .in");
      input?.focus();
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[atlas] failed to register global shortcut "${shortcut}":`, err);
    return async () => {};
  }

  return async () => {
    try {
      await unregister(shortcut);
    } catch {
      // ignore
    }
  };
}
