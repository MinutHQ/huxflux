import { useSyncExternalStore } from "react"
import { getDiffTheme } from "@/domains/file-changes/getDiffTheme"

export function useDiffTheme() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("huxflux:theme-change", cb); return () => window.removeEventListener("huxflux:theme-change", cb) },
    getDiffTheme,
    () => "vesper" as const,
  )
}
