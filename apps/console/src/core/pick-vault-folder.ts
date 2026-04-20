import { open } from "@tauri-apps/plugin-dialog";

export async function pickVaultFolder(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: true,
    title: "Pick your Atlas vault folder",
  });
  if (!result || Array.isArray(result)) return null;
  return result;
}
