import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@huxflux/shared"
import { isTauri } from "@/lib/platform"
import { getFlag } from "@/lib/flags"
import { OPEN_IN_KEY } from "../config"
import { isRemoteServer } from "../utils"

interface SshInfo {
  host: string
  port: number
  user: string
  configured: boolean
}

export function useOpenInApps(agentId: string) {
  const remoteMode = getFlag("remoteEditor") && isTauri && isRemoteServer()
  const [lastOpenInApp, setLastOpenInApp] = useState(() => localStorage.getItem(OPEN_IN_KEY) ?? "finder")
  const [detectedEditors, setDetectedEditors] = useState<string[]>([])
  const [sshInfo, setSshInfo] = useState<SshInfo | null>(null)
  const [showSshSetup, setShowSshSetup] = useState(false)

  // Load SSH info + detect local editors when in remote mode
  useEffect(() => {
    if (!remoteMode) return
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string[]>("detect_editors").then(setDetectedEditors).catch(() => {})
    })
    api.agents.systemSshInfo().then(setSshInfo).catch(() => {})
  }, [remoteMode])

  const doOpenIn = useCallback(async (appKey: string) => {
    if (remoteMode && sshInfo) {
      try {
        // fire-and-forget; intentional: native-bridge SSH launch composes path read with Tauri invoke
        // eslint-disable-next-line no-restricted-syntax
        const res = await api.agents.worktreePath(agentId)
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_ssh_editor", {
          editor: appKey,
          user: sshInfo.user,
          host: sshInfo.host,
          port: sshInfo.port,
          path: res.path,
        })
      } catch (err) {
        toast.error(String(err))
      }
    } else {
      try {
        // fire-and-forget; intentional: native-bridge launch, not a TanStack-cached operation
        // eslint-disable-next-line no-restricted-syntax
        await api.agents.openIn(agentId, appKey)
      } catch (err) {
        toast.error(`Failed to open ${appKey}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }, [agentId, remoteMode, sshInfo])

  const handleOpenIn = useCallback((appKey: string) => {
    localStorage.setItem(OPEN_IN_KEY, appKey)
    setLastOpenInApp(appKey)
    void doOpenIn(appKey)
  }, [doOpenIn])

  // "Open in" keyboard shortcut: Cmd/Ctrl+O reopens last-used app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "o" && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        void doOpenIn(lastOpenInApp)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, lastOpenInApp, remoteMode, sshInfo])

  return {
    remoteMode,
    lastOpenInApp,
    detectedEditors,
    sshInfo,
    showSshSetup,
    setShowSshSetup,
    handleOpenIn,
  }
}
