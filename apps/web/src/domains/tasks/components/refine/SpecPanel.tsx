import { ScrollArea } from "@huxflux/ui"
import {
  IconGitBranch,
  IconListDetails,
  IconTicket,
} from "@tabler/icons-react"
import type { Repo } from "@huxflux/shared"
import type { RefineSession } from "../../tasks.types"
import { EditableField } from "./EditableField"
import { SpecSubtasks } from "./SpecSubtasks"

function SpecHeader() {
  return (
    <div className="px-4 py-2.5 border-b border-border shrink-0">
      <div className="flex items-center gap-2">
        <IconListDetails size={13} className="text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          Task Spec
        </span>
      </div>
    </div>
  )
}

function SpecRepoChips({ repos }: { repos: Repo[] }) {
  if (repos.length === 0) return null
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
        Repos
      </span>
      <div className="flex flex-wrap gap-1.5">
        {repos.map((repo) => (
          <span
            key={repo.id}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[11px] text-primary font-medium"
          >
            <IconGitBranch size={10} />
            {repo.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export function SpecPanel({
  session,
  repos,
  onUpdate,
}: {
  session: RefineSession
  repos: Repo[]
  onUpdate: (s: RefineSession) => void
}) {
  const selectedRepos = session.repoIds
    .map((id) => repos.find((r) => r.id === id))
    .filter((r): r is Repo => !!r)

  const [goal = "", patterns = "", criteria = ""] = session.answers

  const criteriaItems = criteria
    ? criteria
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  function updateAnswer(index: number, value: string) {
    const next = [...session.answers]
    while (next.length <= index) next.push("")
    next[index] = value
    onUpdate({ ...session, answers: next })
  }

  const hasContent =
    goal || patterns || criteria || session.subtasks.length > 0 || selectedRepos.length > 0

  return (
    <div className="flex flex-col h-full bg-background">
      <SpecHeader />
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <IconTicket size={14} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-mono font-medium">{session.ticketId}</span>
          </div>

          <SpecRepoChips repos={selectedRepos} />

          {goal && (
            <EditableField label="Goal" value={goal} onSave={(v) => updateAnswer(0, v)} />
          )}
          {patterns && !/^(n\/a|none|-)$/i.test(patterns.trim()) && (
            <EditableField
              label="Notes"
              value={patterns}
              onSave={(v) => updateAnswer(1, v)}
            />
          )}
          {criteriaItems.length > 0 && (
            <EditableField
              label="Acceptance Criteria"
              value={criteria}
              onSave={(v) => updateAnswer(2, v)}
            />
          )}

          {(session.subtasks.length > 0 || selectedRepos.length > 0) && (
            <SpecSubtasks
              session={session}
              selectedRepos={selectedRepos}
              onUpdate={onUpdate}
            />
          )}

          {!hasContent && (
            <p className="text-center py-8 text-muted-foreground/40 text-sm">
              Spec builds up as you answer questions
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
