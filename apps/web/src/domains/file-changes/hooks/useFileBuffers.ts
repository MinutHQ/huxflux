import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import type { FileBuffer } from "../file-changes.types"

/**
 * Unsaved editor buffers for every open tab in the Files section, so a draft
 * survives switching tabs. `store` is owned by the workspace so drafts also
 * survive switching agents. Warns before the window unloads while any buffer
 * is dirty, and can save a buffer whose editor is not mounted.
 */
export function useFileBuffers(agentId: string, store: Map<string, FileBuffer>) {
  const buffers = useRef(store)
  const [dirty, setDirty] = useState<ReadonlySet<string>>(
    () => new Set([...store].filter(([, b]) => b.draft !== b.baseline).map(([path]) => path)),
  )

  const update = useCallback((path: string, buffer: FileBuffer) => {
    buffers.current.set(path, buffer)
    const isDirty = buffer.draft !== buffer.baseline
    setDirty((prev) => {
      if (prev.has(path) === isDirty) return prev
      const next = new Set(prev)
      if (isDirty) next.add(path)
      else next.delete(path)
      return next
    })
  }, [])

  const drop = useCallback((path: string) => {
    buffers.current.delete(path)
    setDirty((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

  const get = useCallback((path: string) => buffers.current.get(path), [])

  const saveMutation = useHuxfluxMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => api.agents.saveFileContent(agentId, path, content),
    invalidate: (_res, { path }) => [queryKeys.agents.allDiffs(agentId), ["file-read", agentId, path]],
    onError: (err, { path }) => toast.error(`Could not save ${path.split("/").pop()}: ${err.message}`),
  })

  /** Save a buffer by path (used when closing a dirty tab whose editor is not the active one). */
  const saveBuffer = useCallback(async (path: string) => {
    const b = buffers.current.get(path)
    if (!b) return
    await saveMutation.mutateAsync({ path, content: b.draft })
    drop(path)
  }, [saveMutation, drop])

  useEffect(() => {
    if (dirty.size === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  return { dirty, update, drop, get, saveBuffer }
}

export type FileBuffers = ReturnType<typeof useFileBuffers>
