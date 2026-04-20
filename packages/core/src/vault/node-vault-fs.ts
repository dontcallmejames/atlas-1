import {
  readFile,
  writeFile,
  appendFile,
  readdir,
  stat,
  mkdir,
  rm,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { VaultFs, VaultPath } from "@atlas/sdk";

export class NodeVaultFs implements VaultFs {
  constructor(private readonly root: string) {}

  async read(path: VaultPath): Promise<string> {
    return readFile(this.resolvePath(path), "utf8");
  }

  async write(path: VaultPath, content: string): Promise<void> {
    const abs = this.resolvePath(path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }

  async append(path: VaultPath, content: string): Promise<void> {
    const abs = this.resolvePath(path);
    await mkdir(dirname(abs), { recursive: true });
    await appendFile(abs, content, "utf8");
  }

  async list(path: VaultPath): Promise<string[]> {
    const abs = this.resolvePath(path);
    try {
      return await readdir(abs);
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") return [];
      throw err;
    }
  }

  async exists(path: VaultPath): Promise<boolean> {
    try {
      await stat(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  async remove(path: VaultPath): Promise<void> {
    await rm(this.resolvePath(path), { force: true });
  }

  private resolvePath(path: VaultPath): string {
    const abs = resolve(this.root, path);
    const rootResolved = resolve(this.root);
    // Must be inside root (or equal to root).
    if (abs !== rootResolved && !abs.startsWith(rootResolved + sep)) {
      throw new Error(`path escapes outside vault root: ${path}`);
    }
    return abs;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
