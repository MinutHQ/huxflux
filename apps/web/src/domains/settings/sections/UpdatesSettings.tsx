import { useEffect, useState } from "react"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@huxflux/ui"
import { IconRefresh, IconDownload } from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import { isTauri } from "@/lib/platform"
import { toast } from "sonner"

const PENDING_SERVER_UPDATE_KEY = "huxflux:pending-server-update"

export function UpdatesSettings() {
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

  function handleChannelChange(value: string) {
    setChannel(value)
    api.settings.update({ updateChannel: value as "stable" | "beta" })
  }

  function handleAutoUpdateChange(value: boolean) {
    setAutoUpdate(value)
    api.settings.update({ autoUpdateServer: value })
  }

  return (
    <div className="space-y-6">
      <ChannelPicker channel={channel} loaded={loaded} onChange={handleChannelChange} />
      <AutoUpdateToggle autoUpdate={autoUpdate} loaded={loaded} onChange={handleAutoUpdateChange} />
      <ServerUpdateSection channel={channel} />
      {isTauri && <DesktopUpdateSection />}
    </div>
  )
}

function ServerUpdateSection({ channel }: { channel: string }) {
  const [checking, setChecking] = useState(false)
  const [serverVersion, setServerVersion] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    setUpdateAvailable(false)
    setLatestVersion(null)
    api.settings.serverVersion().then((info) => {
      setServerVersion(info.current)
      setLatestVersion(info.latest)
      setUpdateAvailable(info.updateAvailable)
    }).catch(() => {})
  }, [channel])

  async function checkServerUpdate() {
    setChecking(true)
    try {
      const info = await api.settings.checkUpdate()
      setServerVersion(info.current)
      setLatestVersion(info.latest)
      setUpdateAvailable(info.updateAvailable)
      if (!info.updateAvailable) {
        toast.success("Server is up to date")
      }
    } catch {
      toast.error("Failed to check for server updates")
    } finally {
      setChecking(false)
    }
  }

  async function triggerServerUpdate() {
    setUpdating(true)
    try {
      await api.settings.triggerUpdate()
      toast.info("Server updating", { description: "The server will restart with the new version." })
    } catch {
      toast.error("Server update failed")
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-foreground">Server</div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-mono text-foreground">{serverVersion ?? "..."}</div>
          {latestVersion && updateAvailable && (
            <div className="text-[12px] text-muted-foreground mt-0.5">{latestVersion} available</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={checkServerUpdate} disabled={checking || updating} variant="outline" size="sm" className="gap-1.5">
            <IconRefresh size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking..." : "Check"}
          </Button>
          {updateAvailable && (
            <Button onClick={triggerServerUpdate} disabled={checking || updating} size="sm" className="gap-1.5">
              <IconDownload size={14} />
              {updating ? "Updating..." : "Update"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function DesktopUpdateSection() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<"none" | "available" | "error" | null>(null)
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) => {
      getVersion().then(setAppVersion).catch(() => {})
    })
  }, [])

  async function checkNow() {
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
    } catch {
      setResult("error")
    } finally {
      setChecking(false)
    }
  }

  async function installUpdate() {
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

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-foreground">Desktop</div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-mono text-foreground">{appVersion ?? "..."}</div>
          {result === "none" && (
            <div className="text-[12px] text-emerald-400 mt-0.5">Up to date</div>
          )}
          {result === "error" && (
            <div className="text-[12px] text-red-400 mt-0.5">Check failed</div>
          )}
        </div>
        <Button onClick={checkNow} disabled={checking || installing} variant="outline" size="sm" className="gap-1.5">
          <IconRefresh size={14} className={checking ? "animate-spin" : ""} />
          {checking ? "Checking..." : "Check"}
        </Button>
      </div>
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
              <p className="text-[11px] text-muted-foreground">{progress != null ? `${progress}%` : "Downloading..."}</p>
            </div>
          ) : (
            <Button onClick={installUpdate} size="sm" className="gap-1.5">
              <IconDownload size={14} />
              Download &amp; install
            </Button>
          )}
        </div>
      )}
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
