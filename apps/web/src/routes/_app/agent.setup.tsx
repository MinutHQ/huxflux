import { createRoute } from "@tanstack/react-router"
import { SetupView } from "@/components/ChatView"
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext"
import { HomeView } from "@/components/HomeView"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "agent/setup",
  component: SetupRoute,
})

function SetupRoute() {
  const workspace = useWorkspaceContext()

  if (!workspace.pendingAgent) {
    return <HomeView />
  }

  return (
    <div className="flex-1 min-w-0 overflow-hidden">
      <SetupView pending={workspace.pendingAgent} />
    </div>
  )
}
