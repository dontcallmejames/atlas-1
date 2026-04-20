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

  // If a prior webview instance registered this shortcut and the Rust side is
  // still alive (typical during dev reloads), unregister first to avoid the
  // "HotKey already registered" error.
  try {
    await unregister(shortcut);
  } catch {
    // no-op — it might not have been registered
  }

  try {
    await register(shortcut, async (event) => {
      if (event.state !== "Pressed") return;
      const win = getCurrentWindow();
      try {
        await win.show();
        await win.unminimize();
        // Windows blocks programmatic setFocus to prevent focus-stealing.
        // Briefly pinning the window always-on-top forces it forward; we flip
        // it back immediately so it behaves normally afterward.
        await win.setAlwaysOnTop(true);
        await win.setFocus();
        await win.setAlwaysOnTop(false);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[atlas] focus window failed:", err);
      }
      const input = document.querySelector<HTMLInputElement>(".cmdbar .in");
      input?.focus();
    });
    // eslint-disable-next-line no-console
    console.log(`[atlas] global shortcut registered: ${shortcut}`);
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
