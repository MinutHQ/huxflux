import { useCallback } from "react"
import { toast } from "sonner"
import { api } from "@huxflux/shared"
import { downloadUrl } from "@/lib/download"

/** Download a worktree file to the local machine. */
export function useDownloadFile(agentId: string): (path: string) => void {
  return useCallback((path: string) => {
    const url = api.agents.rawFileUrl(agentId, path, true)
    if (!url) { toast.error("No server connected"); return }
    downloadUrl(url, path.slice(path.lastIndexOf("/") + 1))
  }, [agentId])
}
