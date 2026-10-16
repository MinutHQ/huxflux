import { useCallback, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, queryKeys, useHuxfluxMutation, type FileReadResult } from "@huxflux/shared"
import type { FileBuffer } from "../file-changes.types"

interface UseFileBufferArgs {
  agentId: string
  path: string
  force: boolean
  /** Text from disk (null while loading or when withheld as binary). */
  disk: string | null
  /** Buffer kept by the parent from an earlier visit to this tab. */
  restored: FileBuffer | undefined
  onBufferChange: (path: string, buffer: FileBuffer) => void
}

/**
 * Tracks the editor's draft against the on-disk baseline: dirty state, save,
 * and what to do when the file changes on disk underneath an edit. When the
 * draft is clean a disk change is applied straight away (`pendingReload`);
 * when it is dirty the change surfaces as a conflict the user resolves.
 */
export function useFileBuffer({ agentId, path, force, disk, restored, onBufferChange }: UseFileBufferArgs) {
  const queryClient = useQueryClient()
  const [initialDoc, setInitialDoc] = useState<string | null>(restored?.draft ?? null)
  const [baseline, setBaseline] = useState<string | null>(restored?.baseline ?? null)
  const [dirty, setDirty] = useState(!!restored && restored.draft !== restored.baseline)
  const [conflict, setConflict] = useState(false)
  const [pendingReload, setPendingReload] = useState<string | null>(null)
  // Null until the first edit; read through `currentDraft()` so a save before any edit writes the loaded text.
  const draftRef = useRef<string | null>(restored?.draft ?? null)
  const scrollTopRef = useRef(restored?.scrollTop ?? 0)

  if (initialDoc === null && disk !== null) {
    setInitialDoc(disk)
    setBaseline(disk)
  }

  const currentDraft = useCallback(() => draftRef.current ?? initialDoc ?? "", [initialDoc])

  // React to a new disk version during render (once per distinct disk text).
  const [seenDisk, setSeenDisk] = useState<string | null>(disk)
  if (disk !== null && disk !== seenDisk) {
    setSeenDisk(disk)
    if (baseline !== null && disk !== baseline) {
      if (dirty) setConflict(true)
      else {
        setBaseline(disk)
        setPendingReload(disk)
      }
    }
  }

  const report = useCallback((base: string) => {
    onBufferChange(path, { draft: currentDraft(), baseline: base, scrollTop: scrollTopRef.current })
  }, [onBufferChange, path, currentDraft])

  const onChange = useCallback((doc: string) => {
    draftRef.current = doc
    if (baseline === null) return
    setDirty(doc !== baseline)
    report(baseline)
  }, [baseline, report])

  const onScroll = useCallback((top: number) => { scrollTopRef.current = top }, [])

  const save = useHuxfluxMutation({
    mutationFn: (content: string) => api.agents.saveFileContent(agentId, path, content).then(() => content),
    invalidate: () => [queryKeys.agents.allDiffs(agentId)],
    onSuccess: (content) => {
      setBaseline(content)
      setDirty(currentDraft() !== content)
      setConflict(false)
      queryClient.setQueryData<FileReadResult>(queryKeys.agents.fileRead(agentId, path, force), (old) => (old ? { ...old, content } : old))
      report(content)
    },
    onError: (err) => toast.error(`Could not save ${path.split("/").pop()}: ${err.message}`),
  })

  const saveNow = useCallback(() => {
    if (!save.isPending && dirty) save.mutate(currentDraft())
  }, [save, currentDraft, dirty])

  /** Conflict: drop the draft and take the disk version. */
  const reloadFromDisk = useCallback(() => {
    if (disk === null) return
    setConflict(false)
    setBaseline(disk)
    setDirty(false)
    setPendingReload(disk)
  }, [disk])

  /** Conflict: keep the draft; the next save overwrites the disk version. */
  const keepMine = useCallback(() => {
    if (disk === null) return
    setConflict(false)
    setBaseline(disk)
  }, [disk])

  const consumeReload = useCallback(() => {
    if (pendingReload !== null) draftRef.current = pendingReload
    setPendingReload(null)
    if (baseline !== null) report(baseline)
  }, [pendingReload, baseline, report])

  return {
    initialDoc, dirty, conflict, saving: save.isPending, pendingReload,
    onChange, onScroll, saveNow, reloadFromDisk, keepMine, consumeReload,
    initialScrollTop: restored?.scrollTop ?? 0,
  }
}
