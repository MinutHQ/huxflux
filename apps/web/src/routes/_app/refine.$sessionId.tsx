import { createRoute, redirect } from "@tanstack/react-router"
import { RefineView } from "@/domains/tasks/RefineView"
import { saveRefineSessions } from "@/domains/tasks/utils"
import { getFlag } from "@/lib/flags"
import { useAppContext } from "@/hooks/useAppContext"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "refine/$sessionId",
  beforeLoad: () => {
    if (!getFlag("refine")) throw redirect({ to: "/" })
  },
  component: RefineRoute,
})

function RefineRoute() {
  const { sessionId } = Route.useParams()
  const { refineSessions, setRefineSessions } = useAppContext()

  return (
    <div className="flex-1 min-w-0 h-full overflow-hidden flex">
      <RefineView
        sessionId={sessionId}
        sessions={refineSessions}
        onSessionsChange={(next) => { setRefineSessions(next); saveRefineSessions(next) }}
      />
    </div>
  )
}
