import { useCallback } from "react"
import { toast } from "sonner"
import { api } from "@huxflux/shared"
import { isTauri } from "@/lib/platform"

/**
 * Download a worktree file to the local machine. The browser saves it through
 * the server's `Content-Disposition: attachment`; the desktop app asks where
 * to save it and streams it there natively.
 */
export function useDownloadFile(agentId: string): (path: string) => void {
  return useCallback((path: string) => {
    const url = api.agents.rawFileUrl(agentId, path, true)
    if (!url) { toast.error("No server connected"); return }
    const fileName = path.slice(path.lastIndexOf("/") + 1)
    if (isTauri) {
      import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke<boolean>("download_file", { url, fileName }))
        .then((saved) => { if (saved) toast.success(`Downloaded ${fileName}`) })
        .catch((err: unknown) => toast.error(`Download failed: ${String(err)}`))
      return
    }
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.rel = "noreferrer"
    a.click()
  }, [agentId])
}
