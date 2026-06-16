import { useEffect, useState } from "react"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@huxflux/ui"
import { IconRefresh, IconDownload } from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import { isTauri } from "@/lib/platform"

const PENDING_SERVER_UPDATE_KEY = "huxflux:pending-server-update"

export function UpdatesSettings() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<"none" | "available" | "error" | null>(null)
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [channel, setChannel] = useState<string>("stable")
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.settings.current().then((s) => {
      setChannel(s.updateChannel ?? "stable")
      setAutoUpdate(s.autoUpdateServer ?? true)
      setLoaded(true)
    }).catch(() => { setLoaded(true) })
  }, [])

  useEffect(() => {
    if (!isTauri) return
    import("@tauri-apps/api/app").then(({ getVersion }) => {
      getVersion().then(setAppVersion).catch(() => {})
    })
  }, [])

  function handleChannelChange(value: string) {
    setChannel(value)
    setResult(null)
    api.settings.update({ updateChannel: value as "stable" | "beta" })
  }

  function handleAutoUpdateChange(value: boolean) {
    setAutoUpdate(value)
    api.settings.update({ autoUpdateServer: value })
  }

  async function checkNow() {
    if (!isTauri) return
    setChecking(true)
    setResult(null)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const info = await invoke<{ available: boolean; version: string }>("check_update")
      if (info.available) {
        setResult("available")
        setUpdateInfo({ version: info.version })
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
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("download_and_install_update")
      setProgress(100)
      localStorage.setItem(PENDING_SERVER_UPDATE_KEY, "1")
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
    } catch {
      localStorage.removeItem(PENDING_SERVER_UPDATE_KEY)
      setInstalling(false)
      setProgress(null)
    }
  }

  if (!isTauri) {
    return (
      <div className="space-y-6">
        <ChannelPicker channel={channel} loaded={loaded} onChange={handleChannelChange} />
        <AutoUpdateToggle autoUpdate={autoUpdate} loaded={loaded} onChange={handleAutoUpdateChange} />
        <p className="text-[13px] text-muted-foreground">
          Desktop update checks are only available in the desktop app. The server updates via <code className="text-[12px] bg-secondary px-1 py-0.5 rounded">huxflux config channel</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ChannelPicker channel={channel} loaded={loaded} onChange={handleChannelChange} />

      <div className="space-y-1">
        <div className="text-[13px] text-muted-foreground">Current version</div>
        <div className="text-[14px] font-mono text-foreground">{appVersion ?? "…"}</div>
      </div>

      <AutoUpdateToggle autoUpdate={autoUpdate} loaded={loaded} onChange={handleAutoUpdateChange} />

      <div className="space-y-3">
        <Button onClick={checkNow} disabled={checking || installing} variant="outline" size="sm" className="gap-2">
          <IconRefresh size={14} className={checking ? "animate-spin" : ""} />
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
                <IconDownload size={14} />
                Download &amp; install
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/50">
        The desktop checks for updates using the channel selected above. Changing the channel takes effect on the next update check.
      </p>
    </div>
  )
}

function ChannelPicker({ channel, loaded, onChange }: { channel: string; loaded: boolean; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <div className="text-[13px] text-foreground">Update channel</div>
        <div className="text-[12px] text-muted-foreground">Stable receives tested releases. Beta gets new features early but may have bugs.</div>
      </div>
      <Select disabled={!loaded} value={channel} onValueChange={onChange}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stable">Stable</SelectItem>
          <SelectItem value="beta">Beta</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function AutoUpdateToggle({ autoUpdate, loaded, onChange }: { autoUpdate: boolean; loaded: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <div className="text-[13px] text-foreground">Auto-update server</div>
        <div className="text-[12px] text-muted-foreground">Automatically update when a new version is available and no agents are running.</div>
      </div>
      <Switch disabled={!loaded} checked={autoUpdate} onCheckedChange={onChange} />
    </div>
  )
}
