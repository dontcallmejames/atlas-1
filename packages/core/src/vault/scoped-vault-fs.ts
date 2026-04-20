import type { VaultFs, VaultPath } from "@atlas/sdk";

// Minimal POSIX-style path helpers so this module stays dependency-free
// (no "node:path" import) and can be bundled for the webview.
function posixNormalize(p: string): string {
  const isAbsolute = p.startsWith("/");
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (!isAbsolute) parts.push("..");
      continue;
    }
    parts.push(seg);
  }
  const joined = parts.join("/");
  if (isAbsolute) return "/" + joined;
  return joined === "" ? "." : joined;
}

function posixJoin(a: string, b: string): string {
  const combined = a.endsWith("/") || a === "" ? a + b : a + "/" + b;
  return posixNormalize(combined);
}

/**
 * Wrap a VaultFs so every operation is prefixed with `scope`.
 * Any path that normalizes outside the scope (via `..`) is rejected.
 *
 * `scope` is a POSIX-style relative path like "tasks" or "plugins/my-plugin".
 */
export function scopeVaultFs(inner: VaultFs, scope: string): VaultFs {
  const scopeNormalized = posixNormalize(scope).replace(/^\/+/, "");
  if (scopeNormalized === "" || scopeNormalized.startsWith("..")) {
    throw new Error(`invalid scope: ${scope}`);
  }

  function resolveScoped(p: VaultPath): string {
    const joined = posixJoin(scopeNormalized, p);
    const normalized = posixNormalize(joined);
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
