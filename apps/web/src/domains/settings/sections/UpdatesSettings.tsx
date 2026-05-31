import { useEffect, useState } from "react"
import { Button } from "@huxflux/ui"
import * as TablerIcons from "@tabler/icons-react"
import { isTauri } from "@/lib/platform"

export function UpdatesSettings() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<"none" | "available" | "error" | null>(null)
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauri) return
    import("@tauri-apps/api/app").then(({ getVersion }) => {
      getVersion().then(setAppVersion).catch(() => {})
    })
  }, [])

  async function checkNow() {
    if (!isTauri) return
    setChecking(true)
    setResult(null)
    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const update = await check()
      if (update?.available) {
        setResult("available")
        setUpdateInfo({ version: update.version })
      } else {
        setResult("none")
      }
    } catch (err) {
      console.error("[updater] check failed:", err)
      setResult("error")
    } finally {
      setChecking(false)
    }
  }

  async function installUpdate() {
    if (!isTauri) return
    setInstalling(true)
    setProgress(0)
    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const update = await check()
      if (!update?.available) return
      let downloaded = 0
      let total = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update.downloadAndInstall((event: any) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0
        else if (event.event === "Progress") {
          downloaded += event.data.chunkLength
          if (total > 0) setProgress(Math.round((downloaded / total) * 100))
        }
        else if (event.event === "Finished") setProgress(100)
      })
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
    } catch {
      setInstalling(false)
      setProgress(null)
    }
  }

  if (!isTauri) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-muted-foreground">Auto-updates are only available in the desktop app.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-[13px] text-muted-foreground">Current version</div>
        <div className="text-[14px] font-mono text-foreground">{appVersion ?? "…"}</div>
      </div>

      <div className="space-y-3">
        <Button onClick={checkNow} disabled={checking || installing} variant="outline" size="sm" className="gap-2">
          <TablerIcons.IconRefresh size={14} className={checking ? "animate-spin" : ""} />
          {checking ? "Checking…" : "Check for updates"}
        </Button>

        {result === "none" && (
          <p className="text-[12px] text-emerald-400">You're on the latest version.</p>
        )}
        {result === "error" && (
          <p className="text-[12px] text-red-400">Failed to check for updates. No releases found or endpoint unreachable.</p>
        )}
        {result === "available" && updateInfo && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <p className="text-[13px] text-foreground font-medium">
              Version {updateInfo.version} is available
            </p>
            {installing ? (
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress ?? 0}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">{progress != null ? `${progress}%` : "Downloading…"}</p>
              </div>
            ) : (
              <Button onClick={installUpdate} size="sm" className="gap-2">
                <TablerIcons.IconDownload size={14} />
                Download &amp; install
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/50">
        Updates are checked automatically every hour while the app is running.
      </p>
    </div>
  )
}
