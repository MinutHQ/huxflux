// Client-side feature flags backed by localStorage.
// Toggle in the browser console:
//   window.__huxflux_flags.set("prReview", true)
//   window.__huxflux_flags.set("prReview", false)

const STORAGE_KEY = "huxflux:flags"

type Flags = {
  prReview: boolean
  refine: boolean
  remoteEditor: boolean
  tasks: boolean
}

const DEFAULTS: Flags = {
  prReview: false,
  refine: false,
  remoteEditor: false,
  tasks: false,
}

// Flags that are permanently disabled — overrides localStorage
const FORCE_OFF: Partial<Record<keyof Flags, true>> = {
  prReview: true,
}

function load(): Flags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

function save(flags: Flags) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
}

export function getFlag<K extends keyof Flags>(key: K): Flags[K] {
  if (FORCE_OFF[key]) return false as Flags[K]
  return load()[key]
}

export function setFlag<K extends keyof Flags>(key: K, value: Flags[K]) {
  const flags = load()
  flags[key] = value
  save(flags)
}

// Expose to browser console for easy toggling
if (typeof window !== "undefined") {
  (window as any).__huxflux_flags = {
    set: setFlag,
    get: getFlag,
    all: load,
  }
}
