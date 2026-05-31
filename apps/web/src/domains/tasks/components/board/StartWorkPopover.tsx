// Picker shown when starting work on a task (either via the Start-work
// button in the detail sheet or via the drag-to-in-progress intercept on
// the board). Lets the user confirm the repo before spawning the agent.
//
// Note on model/provider: the server-side start-work endpoint takes no
// body. It derives model / provider / repo from the task row itself.
// We surface the pickers visually to match the design but they are
// local-state only today; flipping them to real overrides is a server
// change tracked outside this file.

import { useEffect, useState } from "react"
import { api, useRepos } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@huxflux/ui"
import { IconLoader2, IconPlayerPlay } from "@tabler/icons-react"

export interface StartWorkOpts {
  repoId: string
  model: string
  provider: string
}

export function StartWorkPopover({
  task,
  onStart,
  onClose,
}: {
  task: TaskItem
  onStart: (opts: StartWorkOpts) => Promise<void> | void
  onClose: () => void
}) {
  const { data: repos = [] } = useRepos()
  const [repoId, setRepoId] = useState(task.repoId ?? "")
  const [model, setModel] = useState("Sonnet 4.6")
  const [provider, setProvider] = useState("claude")
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.settings
      .current()
      .then((s: { defaultModel?: string; defaultProvider?: string }) => {
        if (cancelled) return
        if (s.defaultModel) setModel(s.defaultModel)
        if (s.defaultProvider) setProvider(s.defaultProvider)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleStart = async () => {
    if (!repoId || starting) return
    setStarting(true)
    try {
      await onStart({ repoId, model, provider })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="w-[320px] p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-1">
        <h3 className="text-[12px] font-medium text-foreground">Start work</h3>
        <p className="text-[11px] text-muted-foreground/60 leading-snug line-clamp-2">
          {task.title}
        </p>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
            Repository
          </label>
          <Select
            value={repoId || "none"}
            onValueChange={(v) => setRepoId(v === "none" ? "" : v)}
          >
            <SelectTrigger
              className={cn(
                "h-8 text-[12px] rounded-lg",
                !repoId && "border-destructive/50",
              )}
            >
              <SelectValue placeholder="Select repo..." />
            </SelectTrigger>
            <SelectContent>
              {repos.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
              Model
            </label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-8 text-[12px] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Sonnet 4.6" className="text-xs">Sonnet 4.6</SelectItem>
                <SelectItem value="Opus 4.6" className="text-xs">Opus 4.6</SelectItem>
                <SelectItem value="Haiku 4.5" className="text-xs">Haiku 4.5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
              Provider
            </label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="h-8 text-[12px] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude" className="text-xs">Claude</SelectItem>
                <SelectItem value="claude-interactive" className="text-xs">
                  Claude (Interactive)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="xs" onClick={onClose} disabled={starting}>
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={handleStart}
          disabled={!repoId || starting}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {starting ? (
            <IconLoader2 size={12} className="animate-spin" />
          ) : (
            <IconPlayerPlay size={12} />
          )}
          {starting ? "Starting..." : "Start"}
        </Button>
      </div>
    </div>
  )
}
