import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@huxflux/ui"
import { useRepos } from "@huxflux/shared"
import type { RefineSession } from "../tasks.types"
import { saveRefineSessions } from "../utils"
import { ConversationPane } from "./refine/ConversationPane"
import { SpecPanel } from "./refine/SpecPanel"

export function RefineView({
  sessionId,
  sessions,
  onSessionsChange,
}: {
  sessionId: string | null
  sessions: RefineSession[]
  onSessionsChange: (sessions: RefineSession[]) => void
}) {
  const { data: repos = [] } = useRepos()
  const session = sessions.find((s) => s.id === sessionId) ?? null

  function handleUpdate(updated: RefineSession) {
    const next = sessions.map((s) => (s.id === updated.id ? updated : s))
    onSessionsChange(next)
    saveRefineSessions(next)
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a refinement or start a new one
      </div>
    )
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0 h-full">
      <ResizablePanel defaultSize="62" minSize="35">
        <ConversationPane
          key={session.id}
          session={session}
          onUpdate={handleUpdate}
          repos={repos}
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="38" minSize="25">
        <SpecPanel session={session} repos={repos} onUpdate={handleUpdate} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
