import type { VaultFs } from "@atlas/sdk";

const STATE_PATH = ".atlas/plugins.json";

export interface PluginStateEntry {
  id: string;
  enabled: boolean;
  /** Only set for third-party plugins loaded from disk. Built-ins omit this. */
  path?: string;
  version?: string;
}

export interface PluginState {
  plugins: PluginStateEntry[];
}

/** Load `.atlas/plugins.json`. Missing or malformed → empty state. */
export async function loadPluginState(vault: VaultFs): Promise<PluginState> {
  if (!(await vault.exists(STATE_PATH))) return { plugins: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(await vault.read(STATE_PATH));
  } catch {
    return { plugins: [] };
  }
  const list =
    parsed && typeof parsed === "object" && Array.isArray((parsed as PluginState).plugins)
      ? (parsed as PluginState).plugins
      : [];
  const out: PluginStateEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<PluginStateEntry>;
    if (typeof r.id !== "string") continue;
    if (typeof r.enabled !== "boolean") continue;
    const entry: PluginStateEntry = { id: r.id, enabled: r.enabled };
    if (typeof r.path === "string") entry.path = r.path;
    if (typeof r.version === "string") entry.version = r.version;
    out.push(entry);
  }
  return { plugins: out };
}

/** Pretty-print + write `.atlas/plugins.json`. */
export async function savePluginState(vault: VaultFs, state: PluginState): Promise<void> {
  await vault.write(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

/**
 * Upsert the enabled flag for `id`. Adds an entry if absent, otherwise
 * updates it in place.
 */
export async function setPluginEnabled(
  vault: VaultFs,
  id: string,
  enabled: boolean,
): Promise<void> {
  const state = await loadPluginState(vault);
  const existing = state.plugins.find((p) => p.id === id);
  if (existing) {
    existing.enabled = enabled;
  } else {
    state.plugins.push({ id, enabled });
  }
  await savePluginState(vault, state);
}
