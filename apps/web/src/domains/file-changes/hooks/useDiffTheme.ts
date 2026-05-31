import { useSyncExternalStore } from "react"
import { getDiffTheme } from "../getDiffTheme"

/**
 * Returns the current diff theme name and re-renders whenever
 * `huxflux:theme-change` fires on the window.
 */
export function useDiffTheme() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("huxflux:theme-change", cb)
      return () => window.removeEventListener("huxflux:theme-change", cb)
    },
    getDiffTheme,
    () => "vesper" as const,
  )
}
