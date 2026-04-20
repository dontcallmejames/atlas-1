/** POSIX-style relative path, forward slashes only. Never absolute. */
export type VaultPath = string;

/**
 * Plain-text vault filesystem.
 *
 * Paths are interpreted relative to the plugin's scoped root
 * (`plugins/<pluginId>/`) when accessed via `ctx.vault` from a plugin, or
 * relative to the vault root when accessed directly from core. Paths must
 * be POSIX-style (forward slashes); traversal (`..`) is rejected.
 */
export interface VaultFs {
  /** Read a UTF-8 text file. Rejects if the file does not exist. */
  read(path: VaultPath): Promise<string>;
  /** Write (create or overwrite) a UTF-8 text file. Creates parent dirs. */
  write(path: VaultPath, content: string): Promise<void>;
  /** Append UTF-8 text to a file, creating it (and parents) if absent. */
  append(path: VaultPath, content: string): Promise<void>;
  /**
   * List the immediate children of a directory. Returns names only (no
   * path prefix). Rejects if the path is not a directory.
   */
  list(path: VaultPath): Promise<string[]>;
  /** Whether a file or directory exists at the given path. */
  exists(path: VaultPath): Promise<boolean>;
  /** Remove a file. Rejects on directories and on missing files. */
  remove(path: VaultPath): Promise<void>;
}
