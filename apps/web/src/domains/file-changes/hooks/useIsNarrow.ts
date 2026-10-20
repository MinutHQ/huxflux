import { useCallback, useState } from "react"

/**
 * Tracks whether the element given to the returned ref is narrower than
 * `maxWidth` CSS pixels. Null until it has been measured. The first
 * measurement happens in the ref callback, before paint, so callers can wait
 * for it instead of mounting the wrong layout first.
 */
export function useIsNarrow(maxWidth: number): [(el: HTMLElement | null) => (() => void) | undefined, boolean | null] {
  const [narrow, setNarrow] = useState<boolean | null>(null)

  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return
    setNarrow(el.clientWidth < maxWidth)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setNarrow(el.clientWidth < maxWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [maxWidth])

  return [ref, narrow]
}
