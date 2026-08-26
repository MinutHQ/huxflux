// Local user preferences for the sidebar usage readout.
// Persisted in localStorage. Read/write through these accessors only.

const SPEND_WINDOW_KEY = "huxflux:usage:spend-window"

/** Which trailing window the credits row diffs against. */
export type SpendWindow = "hour" | "day" | "week"

const SPEND_WINDOWS: SpendWindow[] = ["hour", "day", "week"]

export function getSpendWindow(): SpendWindow {
  const stored = localStorage.getItem(SPEND_WINDOW_KEY) as SpendWindow | null
  return stored && SPEND_WINDOWS.includes(stored) ? stored : "hour"
}

export function setSpendWindow(window: SpendWindow) {
  localStorage.setItem(SPEND_WINDOW_KEY, window)
}

/** Next window in the hour → day → week → hour cycle. */
export function nextSpendWindow(current: SpendWindow): SpendWindow {
  const index = SPEND_WINDOWS.indexOf(current)
  return SPEND_WINDOWS[(index + 1) % SPEND_WINDOWS.length] ?? "hour"
}
