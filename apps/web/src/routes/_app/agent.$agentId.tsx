import { createRoute } from "@tanstack/react-router"
import { AgentWorkspace } from "@/domains/agents/AgentWorkspace"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "agent/$agentId",
  component: AgentRoute,
})

function AgentRoute() {
  const { agentId } = Route.useParams()
  return <AgentWorkspace agentId={agentId} />
}
