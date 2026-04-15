import { createRoute } from "@tanstack/react-router"
import { TeardownView } from "@/components/ChatView"
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext"
import { HomeView } from "@/components/HomeView"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "agent/teardown",
  component: TeardownRoute,
})

function TeardownRoute() {
  const workspace = useWorkspaceContext()

  if (!workspace.deletingAgent) {
    return <HomeView />
  }

  return (
    <div className="flex-1 min-w-0 overflow-hidden">
      <TeardownView deleting={workspace.deletingAgent} />
    </div>
  )
}
