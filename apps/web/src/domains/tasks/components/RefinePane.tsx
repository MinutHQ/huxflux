import { useState } from "react"
import { IconFlask, IconPlus, IconTicket } from "@tabler/icons-react"
import { Button, ScrollArea, cn } from "@huxflux/ui"
import { useMatchRoute, useNavigate } from "@tanstack/react-router"
import type { RefineSession } from "../tasks.types"

interface RefinePaneProps {
  refineSessions: RefineSession[]
  onNewRefine?: (ticketId: string) => void
}

/**
 * The Refine tab's contents: header with "new refinement" CTA, a ticket-id
 * input that appears on demand, and a list of saved refinement sessions
 * (most recent first). Behind the `refine` flag.
 *
 * Selection state lives in the route — clicking a session navigates to
 * `/refine/$sessionId` and the URL is the source of truth.
 */
export function RefinePane({ refineSessions, onNewRefine }: RefinePaneProps) {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const refineMatch = matchRoute({ to: "/refine/$sessionId", fuzzy: false }) as
    | { sessionId: string }
    | false
  const selectedRefineId = refineMatch ? refineMatch.sessionId : null

  const [showNewRefine, setShowNewRefine] = useState(false)
  const [newRefineInput, setNewRefineInput] = useState("")

  const onSelectRefine = (id: string) =>
    navigate({ to: "/refine/$sessionId", params: { sessionId: id } })

  return (
    <>
      {/* Refine header */}
      <div className="px-4 py-2.5 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            Refinements
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowNewRefine(true)}
            title="New refinement"
          >
            <IconPlus size={13} />
          </Button>
        </div>
      </div>

      {/* New refinement input */}
      {showNewRefine && (
        <div className="px-3 py-2 border-b border-sidebar-border shrink-0 flex gap-2 items-center">
          <IconTicket size={12} className="text-muted-foreground/40 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Ticket ID (e.g. ENG-123)"
            value={newRefineInput}
            onChange={(e) => setNewRefineInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newRefineInput.trim()) {
                onNewRefine?.(newRefineInput.trim())
                setNewRefineInput("")
                setShowNewRefine(false)
              }
              if (e.key === "Escape") {
                setNewRefineInput("")
                setShowNewRefine(false)
              }
            }}
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      )}

      {/* Refinement sessions list */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-0.5">
            {refineSessions.length === 0 ? (
              <button
                onClick={() => setShowNewRefine(true)}
                className="w-full flex flex-col items-center gap-2 py-8 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <IconFlask size={20} />
                <span className="text-[12px]">Start a new refinement</span>
              </button>
            ) : (
              refineSessions
                .slice()
                .reverse()
                .map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelectRefine(session.id)}
                    className={cn(
                      "w-full min-w-0 flex items-start gap-2 px-2.5 py-2 rounded-md text-left transition-all overflow-hidden",
                      selectedRefineId === session.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <IconTicket
                      size={12}
                      className="shrink-0 mt-0.5 text-muted-foreground/50"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono font-medium truncate block">
                        {session.ticketId}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {session.agentId ? "In progress" : "Starting…"}
                      </span>
                    </div>
                    {session.agentId && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0 mt-1.5" />
                    )}
                  </button>
                ))
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  )
}
