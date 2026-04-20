import type { VaultFs, VaultPath } from "@atlas/sdk";
import { invoke } from "@tauri-apps/api/core";

/**
 * VaultFs implementation backed by Tauri IPC commands defined in src-tauri/src/vault.rs.
 * The vault root is a process-level singleton set via `setVaultRoot`.
 */
export class TauriVaultFs implements VaultFs {
  read(path: VaultPath): Promise<string> {
    return invoke<string>("vault_read", { path });
  }

  write(path: VaultPath, content: string): Promise<void> {
    return invoke<void>("vault_write", { path, content });
  }

  append(path: VaultPath, content: string): Promise<void> {
    return invoke<void>("vault_append", { path, content });
  }

  list(path: VaultPath): Promise<string[]> {
    return invoke<string[]>("vault_list", { path });
  }

  exists(path: VaultPath): Promise<boolean> {
    return invoke<boolean>("vault_exists", { path });
  }

  remove(path: VaultPath): Promise<void> {
    return invoke<void>("vault_remove", { path });
  }

  setVaultRoot(path: string): Promise<void> {
    return invoke<void>("set_vault_root", { path });
  }

  getVaultRoot(): Promise<string | null> {
    return invoke<string | null>("get_vault_root");
  }
}
