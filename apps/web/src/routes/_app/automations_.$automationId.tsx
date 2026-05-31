import { createRoute, redirect } from "@tanstack/react-router"
import { AutomationWorkspace } from "@/domains/automations/AutomationWorkspace"
import { getFlag } from "@/lib/flags"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "automations/$automationId",
  beforeLoad: () => {
    if (!getFlag("automations")) throw redirect({ to: "/" })
  },
  component: function AutomationDetailRoute() {
    const { automationId } = Route.useParams()
    return <AutomationWorkspace automationId={automationId} />
  },
})
