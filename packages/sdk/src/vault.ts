export type VaultPath = string; // always POSIX-style, forward slashes

export interface VaultFs {
  read(path: VaultPath): Promise<string>;
  write(path: VaultPath, content: string): Promise<void>;
  append(path: VaultPath, content: string): Promise<void>;
  list(path: VaultPath): Promise<string[]>;
  exists(path: VaultPath): Promise<boolean>;
  remove(path: VaultPath): Promise<void>;
}
