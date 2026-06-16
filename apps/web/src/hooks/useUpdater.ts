import { useEffect, useState } from "react"
import { toast } from "sonner"
import { isTauri } from "@/lib/platform"
import { api } from "@huxflux/shared"

const PENDING_SERVER_UPDATE_KEY = "huxflux:pending-server-update"

interface UpdateInfo {
  available: boolean
  version: string
  current_version: string
}

interface UpdaterState {
  update: UpdateInfo | null
  isInstalling: boolean
  progress: number | null
  needsManualRestart: boolean
  serverUpdating: boolean
  downloadAndInstall: () => Promise<void>
}

async function invokeCheckUpdate(): Promise<UpdateInfo | null> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<UpdateInfo>("check_update")
}

export function useUpdater(): UpdaterState {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [needsManualRestart, setNeedsManualRestart] = useState(false)
  const [serverUpdating, setServerUpdating] = useState(false)

  useEffect(() => {
    if (!isTauri) return

    let cancelled = false

    function doCheck() {
      invokeCheckUpdate()
        .then((info) => {
          if (!cancelled && info?.available) setUpdate(info)
        })
        .catch(() => { /* no update or offline */ })
    }

    doCheck()
    const interval = setInterval(doCheck, 60 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

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
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("download_and_install_update")
      setProgress(100)
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
