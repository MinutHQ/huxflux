import { createRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useMemo } from "react"
import { WorkerPoolContextProvider } from "@pierre/diffs/react"
import { useAgents } from "@huxflux/shared"
import { PaneContainer } from "@/components/PaneContainer"
import { HomeView } from "@/components/HomeView"
import { usePaneLayoutContext } from "@/hooks/usePaneLayoutContext"
import { useIsDragging } from "../_app"
import { getDiffTheme } from "@/components/DiffView"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "agent/$agentId",
  component: AgentRoute,
})

function AgentRoute() {
  const { agentId } = Route.useParams()
  const navigate = useNavigate()
  const { data: agents = [] } = useAgents()
  const layout = usePaneLayoutContext()
  const isDragging = useIsDragging()

  const workerPoolOptions = useMemo(() => ({
    poolOptions: {
      workerFactory: () => new Worker(
        new URL("@pierre/diffs/worker/worker.js", import.meta.url),
        { type: "module" }
      ),
    },
    highlighterOptions: {
      theme: getDiffTheme(),
      lineDiffType: "word" as const,
    },
  }), [])

  // Sync URL agentId with focused pane
  const prevAgentIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!agentId || agentId === prevAgentIdRef.current) return
    prevAgentIdRef.current = agentId

    // If a pane already shows this agent, just focus it
    const existingPane = layout.findLeafByAgent(agentId)
    if (existingPane) {
      layout.focusPane(existingPane.id)
    } else {
      // Replace the focused pane's agent
      layout.replaceAgent(layout.state.focusedPaneId, agentId)
    }
  }, [agentId])

  // When focus changes, update URL to match focused pane's agent
  const focusedAgentId = layout.getFocusedAgentId()
  useEffect(() => {
    if (focusedAgentId && focusedAgentId !== agentId) {
      prevAgentIdRef.current = focusedAgentId
      navigate({ to: "/agent/$agentId", params: { agentId: focusedAgentId }, replace: true })
    }
  }, [focusedAgentId])

  if (agents.length === 0) {
    return <HomeView />
  }

  return (
    <WorkerPoolContextProvider {...workerPoolOptions}>
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <PaneContainer
          node={layout.state.root}
          focusedPaneId={layout.state.focusedPaneId}
          onFocusPane={layout.focusPane}
          onClosePane={layout.closePane}
          onResizePane={layout.resizePane}
          paneCount={layout.paneCount}
          isDragging={isDragging}
        />
      </div>
    </WorkerPoolContextProvider>
  )
}
