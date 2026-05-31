import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Update, DownloadEvent } from "@tauri-apps/plugin-updater"
import { isTauri } from "@/lib/platform"

interface UpdaterState {
  update: Update | null
  isInstalling: boolean
  progress: number | null  // 0–100
  needsManualRestart: boolean
  downloadAndInstall: () => Promise<void>
}

export function useUpdater(): UpdaterState {
  const [update, setUpdate] = useState<Update | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [needsManualRestart, setNeedsManualRestart] = useState(false)

  useEffect(() => {
    if (!isTauri) return

    let cancelled = false

    function doCheck() {
      import("@tauri-apps/plugin-updater").then(({ check }) => {
        check().then((u) => {
          if (!cancelled && u?.available) setUpdate(u)
        }).catch(() => { /* no update or offline */ })
      })
    }

    doCheck()
    const interval = setInterval(doCheck, 60 * 60 * 1000) // re-check every hour
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  async function downloadAndInstall() {
    if (!update) return
    setIsInstalling(true)
    setProgress(0)
    try {
      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength
          if (total > 0) setProgress(Math.round((downloaded / total) * 100))
        } else if (event.event === "Finished") {
          setProgress(100)
        }
      })
      // Update installed — try to relaunch
      console.info("[updater] download+install complete, attempting relaunch")
      try {
        const { relaunch } = await import("@tauri-apps/plugin-process")
        await relaunch()
      } catch (err) {
        console.error("[updater] relaunch failed:", err)
        toast.error("Relaunch failed", { description: `${err}. Quit and reopen manually.`, duration: 10000 })
        setNeedsManualRestart(true)
        setIsInstalling(false)
      }
    } catch (err) {
      console.error("[updater] download/install failed:", err)
      toast.error("Update failed", { description: `${err}`, duration: 10000 })
      setIsInstalling(false)
      setProgress(null)
    }
  }

  return { update, isInstalling, progress, needsManualRestart, downloadAndInstall }
}
