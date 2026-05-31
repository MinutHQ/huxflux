import { createRoute } from "@tanstack/react-router"
import { TeardownView } from "@/domains/chat/TeardownView"
import { useWorkspaceContext } from "@/app-shell/workspace"
import { HomeView } from "@/domains/agents/HomeView"
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
