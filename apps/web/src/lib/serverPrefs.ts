import { getActiveServer } from "@huxflux/shared"

// UI prefs that only make sense for one server (repo filter, grouping) are
// stored under `<key>:<serverId>`. Switching server reloads the page, so
// reading the active id once per read is enough.
function scopedKey(key: string): string | null {
  const id = getActiveServer()?.id
  return id ? `${key}:${id}` : null
}

/**
 * Read a per-server pref. Falls back to the unscoped `key`, which held the
 * value back when these prefs were global, so existing choices carry over.
 */
export function readServerPref(key: string): string | null {
  try {
    const scoped = scopedKey(key)
    const value = scoped ? localStorage.getItem(scoped) : null
    return value ?? localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeServerPref(key: string, value: string): void {
  try {
    localStorage.setItem(scopedKey(key) ?? key, value)
  } catch {
    // Storage blocked: the pref still applies for this session.
  }
}
