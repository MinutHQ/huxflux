import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@huxflux/ui"
import { IconExternalLink } from "@tabler/icons-react"
import { useRepos } from "@huxflux/shared"
import type { TaskItem } from "@huxflux/shared"
import { handleExternalClick } from "@/lib/platform"
import { COLUMNS, PRIORITY_CONFIG } from "../../config"
import type { TaskColumn } from "../../tasks.types"
import { useJiraHost } from "../../hooks/useJiraHost"
import { PriorityIcon } from "../PriorityIcon"

function StatusRow({
  item,
  onUpdate,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
}) {
  const columnDef = COLUMNS.find((c) => c.id === item.status)
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-muted-foreground/50 w-16 shrink-0">Status</span>
      <Select
        value={item.status}
        onValueChange={(v) => onUpdate({ status: v as TaskColumn })}
      >
        <SelectTrigger className="h-6 px-2 text-xs gap-1.5 border-0 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                columnDef?.dotClass ?? "bg-muted-foreground/40",
              )}
            />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {COLUMNS.map((col) => (
            <SelectItem key={col.id} value={col.id} className="text-xs">
              <div className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", col.dotClass)} />
                {col.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function RepoRow({
  item,
  onUpdate,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
}) {
  const { data: repos = [] } = useRepos()
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-muted-foreground/50 w-16 shrink-0">Repo</span>
      <Select
        value={item.repoId ?? "none"}
        onValueChange={(v) => onUpdate({ repoId: v === "none" ? null : v })}
      >
        <SelectTrigger className="h-6 px-2 text-xs gap-1.5 border-0 bg-transparent hover:bg-accent/50 w-auto min-w-0 shadow-none">
          <SelectValue placeholder="Select repo..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-xs">
            No repo
          </SelectItem>
          {repos.map((r) => (
            <SelectItem key={r.id} value={r.id} className="text-xs">
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function TaskProperties({
  item,
  onUpdate,
}: {
  item: TaskItem
  onUpdate: (updates: Partial<TaskItem>) => void
}) {
  const jiraHost = useJiraHost()
  return (
    <div className="space-y-1.5 text-xs">
      <StatusRow item={item} onUpdate={onUpdate} />
      {item.priority && (
        <div className="flex items-center gap-3 py-1">
          <span className="text-muted-foreground/50 w-16 shrink-0">Priority</span>
          <div className="flex items-center gap-1.5 px-2">
            <PriorityIcon priority={item.priority} size={12} />
            <span className="text-foreground">
              {PRIORITY_CONFIG[item.priority]?.label ?? item.priority}
            </span>
          </div>
        </div>
      )}
      {item.assignee && (
        <div className="flex items-center gap-3 py-1">
          <span className="text-muted-foreground/50 w-16 shrink-0">Assignee</span>
          <span className="text-foreground px-2">{item.assignee}</span>
        </div>
      )}
      {item.projectKey && (
        <div className="flex items-center gap-3 py-1">
          <span className="text-muted-foreground/50 w-16 shrink-0">Project</span>
          <span className="text-foreground font-mono px-2">{item.projectKey}</span>
        </div>
      )}
      {item.sprintName && (
        <div className="flex items-center gap-3 py-1">
          <span className="text-muted-foreground/50 w-16 shrink-0">Sprint</span>
          <span className="text-foreground px-2">{item.sprintName}</span>
        </div>
      )}
      {item.jiraKey && (
        <div className="flex items-center gap-3 py-1">
          <span className="text-muted-foreground/50 w-16 shrink-0">Jira</span>
          <a
            href={`https://${jiraHost}/browse/${item.jiraKey}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalClick}
            className="flex items-center gap-1.5 px-2 text-foreground font-mono hover:text-primary transition-colors"
          >
            {item.jiraKey}
            <IconExternalLink size={10} className="text-muted-foreground/40" />
          </a>
        </div>
      )}
      <RepoRow item={item} onUpdate={onUpdate} />
    </div>
  )
}
