import { posix as posixPath } from "node:path";
import type { VaultFs, VaultPath } from "@atlas/sdk";

/**
 * Wrap a VaultFs so every operation is prefixed with `scope`.
 * Any path that normalizes outside the scope (via `..`) is rejected.
 *
 * `scope` is a POSIX-style relative path like "tasks" or "plugins/my-plugin".
 */
export function scopeVaultFs(inner: VaultFs, scope: string): VaultFs {
  const scopeNormalized = posixPath.normalize(scope).replace(/^\/+/, "");
  if (scopeNormalized === "" || scopeNormalized.startsWith("..")) {
    throw new Error(`invalid scope: ${scope}`);
  }

  function resolveScoped(p: VaultPath): string {
    const joined = posixPath.join(scopeNormalized, p);
    const normalized = posixPath.normalize(joined);
    if (
      normalized !== scopeNormalized &&
      !normalized.startsWith(scopeNormalized + "/")
    ) {
      throw new Error(`path outside scope "${scopeNormalized}": ${p}`);
    }
    return normalized;
  }

  return {
    read: async (p) => inner.read(resolveScoped(p)),
    write: async (p, content) => inner.write(resolveScoped(p), content),
    append: async (p, content) => inner.append(resolveScoped(p), content),
    list: async (p) => inner.list(resolveScoped(p)),
    exists: async (p) => inner.exists(resolveScoped(p)),
    remove: async (p) => inner.remove(resolveScoped(p)),
  };
}
