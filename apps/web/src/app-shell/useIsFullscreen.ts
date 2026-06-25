import { useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { isTauri } from "@/lib/platform"

/**
 * Tracks whether the desktop window is in native (macOS) fullscreen. In
 * fullscreen the traffic lights and title bar hide, so chrome that reserves
 * space for them (e.g. the sidebar header's left gutter) should collapse.
 *
 * Returns false in the browser — there is no window chrome to reason about.
 * Entering/leaving fullscreen fires a resize, so we re-read `isFullscreen()`
 * on every resize rather than relying on a dedicated event.
 */
export function useIsFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    let cancelled = false
    let unlisten: (() => void) | undefined

    const appWindow = getCurrentWindow()
    const sync = () => {
      void appWindow.isFullscreen().then((value) => {
        if (!cancelled) setFullscreen(value)
      })
    }

    sync()
    void appWindow.onResized(sync).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return fullscreen
}
