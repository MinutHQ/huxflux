import { getStorage } from "@huxflux/shared"

// Local-only preferences. Server-side settings (git toggles, review prompt,
// models, integrations, updates) live in the `/api/settings` blob and are read
// through `useServerSettings` in the settings domain, not here.

const STRIP_KEY = "huxflux:strip:youre-right"
const ALWAYS_CONTEXT_KEY = "huxflux:always:context"
const NOTIF_ENABLED_KEY = "huxflux:notif:enabled"
const NOTIF_SOUND_KEY = "huxflux:notif:sound"
export const COLLAPSED_SECTIONS_KEY = "huxflux:mobile:collapsed-sections"
export const REPO_FILTER_KEY = "huxflux:mobile:repo-filter"
export const GROUP_BY_KEY = "huxflux:mobile:group-by"
export const DOWNLOAD_DIR_KEY = "huxflux:mobile:download-dir"

export const PREF_KEYS = [
  STRIP_KEY,
  ALWAYS_CONTEXT_KEY,
  NOTIF_ENABLED_KEY,
  NOTIF_SOUND_KEY,
  COLLAPSED_SECTIONS_KEY,
  REPO_FILTER_KEY,
  GROUP_BY_KEY,
  DOWNLOAD_DIR_KEY,
]

function get(key: string, defaultVal: boolean): boolean {
  const v = getStorage().getItem(key)
  if (v === null) return defaultVal
  return v === "true"
}

function set(key: string, value: boolean) {
  getStorage().setItem(key, String(value))
}

export const prefs = {
  getStripYoureRight: () => get(STRIP_KEY, false),
  setStripYoureRight: (v: boolean) => set(STRIP_KEY, v),

  getAlwaysContext: () => get(ALWAYS_CONTEXT_KEY, false),
  setAlwaysContext: (v: boolean) => set(ALWAYS_CONTEXT_KEY, v),

  // Local notification when an agent finishes a turn, and whether it plays a
  // sound. Same keys as the web client's notification prefs.
  getNotificationsEnabled: () => get(NOTIF_ENABLED_KEY, true),
  setNotificationsEnabled: (v: boolean) => set(NOTIF_ENABLED_KEY, v),

  getNotificationSound: () => get(NOTIF_SOUND_KEY, true),
  setNotificationSound: (v: boolean) => set(NOTIF_SOUND_KEY, v),

  // The Android folder the user picked for saved files, as a Storage Access
  // Framework tree URI. Remembered so only the first download has to ask.
  getDownloadDir: () => getStorage().getItem(DOWNLOAD_DIR_KEY),
  setDownloadDir: (uri: string) => getStorage().setItem(DOWNLOAD_DIR_KEY, uri),
  clearDownloadDir: () => getStorage().removeItem(DOWNLOAD_DIR_KEY),
}
