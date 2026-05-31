import { useEffect, useState } from "react"
import { api, getActiveServer } from "@huxflux/shared"
import { toast } from "sonner"
import { getFlag } from "@/lib/flags"
import { isTauri } from "@/lib/platform"
import { OPEN_IN_KEY } from "../config"
import type { SshInfo } from "../agents.types"
import { isRemoteServer } from "../utils"

interface UseOpenInEditorArgs {
  agentId: string
}

interface UseOpenInEditorResult {
  lastApp: string
  handleOpenIn: (appKey: string) => void
  remoteMode: boolean
  detectedEditors: string[]
  sshInfo: SshInfo | null
}

/** Drives the "Open in editor" split-button: persisted last choice, ⌘O shortcut, SSH-aware launch. */
export function useOpenInEditor({ agentId }: UseOpenInEditorArgs): UseOpenInEditorResult {
  const [lastApp, setLastApp] = useState(() => localStorage.getItem(OPEN_IN_KEY) ?? "vscode")
  const remoteMode = getFlag("remoteEditor") && isTauri && isRemoteServer()
  const [detectedEditors, setDetectedEditors] = useState<string[]>([])
  const [sshInfo, setSshInfo] = useState<SshInfo | null>(null)

  useEffect(() => {
    if (!remoteMode) return
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string[]>("detect_editors").then(setDetectedEditors).catch(() => {})
    })
    api.agents.systemSshInfo().then(setSshInfo).catch(() => {})
  }, [remoteMode])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "o" && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        void doOpenIn(lastApp)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, lastApp, remoteMode, sshInfo])

  async function doOpenIn(appKey: string) {
    if (isRemoteServer()) {
      await openRemote(appKey)
    } else {
      await openLocal(appKey)
    }
  }

  async function openLocal(appKey: string) {
    try {
      // fire-and-forget; intentional: native-bridge launch, not a TanStack-cached operation
      // eslint-disable-next-line no-restricted-syntax
      await api.agents.openIn(agentId, appKey)
    } catch (err) {
      toast.error(`Failed to open ${appKey}: ${err instanceof Error ? err.message : err}`)
    }
  }

  async function openRemote(appKey: string) {
    try {
      // fire-and-forget; intentional: native-bridge SSH launch composes path read with Tauri invoke
      // eslint-disable-next-line no-restricted-syntax
      const res = await api.agents.worktreePath(agentId)
      if (isTauri && sshInfo) {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_ssh_editor", {
          editor: appKey,
          user: sshInfo.user,
          host: sshInfo.host,
          port: sshInfo.port,
          path: res.path,
        })
      } else {
        const server = getActiveServer()
        const host = server ? new URL(server.url).hostname : "server"
        const sshCmd = appKey === "vscode"
          ? `code --remote ssh-remote+${host} ${res.path}`
          : appKey === "cursor"
          ? `cursor --remote ssh-remote+${host} ${res.path}`
          : `ssh ${host} -t "cd ${res.path} && $SHELL -l"`
        await navigator.clipboard.writeText(sshCmd)
        toast.success("Command copied", { description: sshCmd })
      }
    } catch (err) {
      toast.error(`Failed to open: ${err}`)
    }
  }

  function handleOpenIn(appKey: string) {
    localStorage.setItem(OPEN_IN_KEY, appKey)
    setLastApp(appKey)
    void doOpenIn(appKey)
  }

  return { lastApp, handleOpenIn, remoteMode, detectedEditors, sshInfo }
}
