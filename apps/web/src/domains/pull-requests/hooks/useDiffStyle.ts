import { useCallback, useState } from "react"
import { STORAGE_KEYS } from "../config"

type DiffStyle = "unified" | "split"

/** Persists the user's preferred diff style for the PR review page. */
export function useDiffStyle() {
  const [diffStyle, setDiffStyleState] = useState<DiffStyle>(
    () => (localStorage.getItem(STORAGE_KEYS.diffStyle) as DiffStyle | null) ?? "unified",
  )

  const setDiffStyle = useCallback((next: DiffStyle) => {
    setDiffStyleState(next)
    localStorage.setItem(STORAGE_KEYS.diffStyle, next)
  }, [])

  return { diffStyle, setDiffStyle }
}
