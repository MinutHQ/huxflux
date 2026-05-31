import { useEffect, useState } from "react"
import { Switch } from "@huxflux/ui"
import { api } from "@huxflux/shared"
import { getFlag, setFlag } from "@/lib/flags"

export function ExperimentalSettings() {
  const [prReview, setPrReview] = useState(() => getFlag("prReview"))
  const [refine, setRefine] = useState(() => getFlag("refine"))
  const [remoteEditor, setRemoteEditor] = useState(() => getFlag("remoteEditor"))
  const [tasks, setTasks] = useState(() => getFlag("tasks"))
  const [threads, setThreads] = useState(() => getFlag("threads"))
  const [threadsServer, setThreadsServer] = useState(false)

  useEffect(() => {
    api.settings.current().then((s) => setThreadsServer(s.threadsEnabled ?? false)).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <ExperimentalRow
        label="PR Review"
        description="Show a Review tab in the sidebar for reviewing GitHub pull requests. Reload required after toggling."
        checked={prReview}
        onChange={(v) => { setFlag("prReview", v); setPrReview(v) }}
      />
      <ExperimentalRow
        label="Refine"
        description="Show a Refine tab in the sidebar for breaking down tickets into subtasks. Reload required after toggling."
        checked={refine}
        onChange={(v) => { setFlag("refine", v); setRefine(v) }}
      />
      <ExperimentalRow
        label="Remote Editor"
        description="Open worktrees in VS Code or Cursor via Remote SSH when connected to a remote server. Desktop only."
        checked={remoteEditor}
        onChange={(v) => { setFlag("remoteEditor", v); setRemoteEditor(v) }}
      />
      <ExperimentalRow
        label="Tasks"
        description="Show a Tasks board in the sidebar for managing work items with Kanban columns. Syncs with Jira via acli. Reload required after toggling."
        checked={tasks}
        onChange={(v) => { setFlag("tasks", v); setTasks(v) }}
      />
      <ExperimentalRow
        label="Thread Agents"
        description="Allow agents to spawn thread agents in other repos for cross-repo work (e.g. translations). Agents can create new workspaces via <huxflux:spawn> tags."
        checked={threads && threadsServer}
        onChange={(v) => {
          setFlag("threads", v)
          setThreads(v)
          api.settings.update({ threadsEnabled: v })
          setThreadsServer(v)
        }}
      />
    </div>
  )
}

function ExperimentalRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
