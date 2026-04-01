import { useEffect, useState } from "react"
import type { Update } from "@tauri-apps/plugin-updater"

interface UpdaterState {
  update: Update | null
  isInstalling: boolean
  progress: number | null  // 0–100
  downloadAndInstall: () => Promise<void>
}

export function useUpdater(): UpdaterState {
  const [update, setUpdate] = useState<Update | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    if (!("__TAURI__" in window)) return

    let cancelled = false
    import("@tauri-apps/plugin-updater").then(({ check }) => {
      check().then((u) => {
        if (!cancelled && u?.available) setUpdate(u)
      }).catch(() => { /* no update or offline */ })
    })
    return () => { cancelled = true }
  }, [])

  async function downloadAndInstall() {
    if (!update) return
    setIsInstalling(true)
    setProgress(0)
    try {
      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength
          if (total > 0) setProgress(Math.round((downloaded / total) * 100))
        } else if (event.event === "Finished") {
          setProgress(100)
        }
      })
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
    } catch {
      setIsInstalling(false)
      setProgress(null)
    }
  }

  return { update, isInstalling, progress, downloadAndInstall }
}
