import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Update, DownloadEvent } from "@tauri-apps/plugin-updater"
import { isTauri } from "@/lib/platform"
import { api } from "@huxflux/shared"

const PENDING_SERVER_UPDATE_KEY = "huxflux:pending-server-update"

interface UpdaterState {
  update: Update | null
  isInstalling: boolean
  progress: number | null  // 0–100
  needsManualRestart: boolean
  serverUpdating: boolean
  downloadAndInstall: () => Promise<void>
}

export function useUpdater(): UpdaterState {
  const [update, setUpdate] = useState<Update | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [needsManualRestart, setNeedsManualRestart] = useState(false)
  const [serverUpdating, setServerUpdating] = useState(false)

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
    const interval = setInterval(doCheck, 60 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // After a desktop update + relaunch, trigger the server update too
  useEffect(() => {
    if (!isTauri) return
    const pending = localStorage.getItem(PENDING_SERVER_UPDATE_KEY)
    if (!pending) return
    localStorage.removeItem(PENDING_SERVER_UPDATE_KEY)

    setServerUpdating(true)
    api.settings.checkUpdate()
      .then((info) => {
        if (!info.updateAvailable) {
          setServerUpdating(false)
          return
        }
        return api.settings.triggerUpdate()
          .then(() => {
            toast.info("Server updating", { description: "The server is restarting with the new version." })
            setServerUpdating(false)
          })
          .catch(() => {
            toast.error("Server update failed", { description: "You can update manually from Settings." })
            setServerUpdating(false)
          })
      })
      .catch(() => { setServerUpdating(false) })
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
      console.info("[updater] download+install complete, attempting relaunch")
      try {
        localStorage.setItem(PENDING_SERVER_UPDATE_KEY, "1")
        const { relaunch } = await import("@tauri-apps/plugin-process")
        await relaunch()
      } catch (err) {
        localStorage.removeItem(PENDING_SERVER_UPDATE_KEY)
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

  return { update, isInstalling, progress, needsManualRestart, serverUpdating, downloadAndInstall }
}
