import { createRoute, redirect } from "@tanstack/react-router"
import { AutomationsView } from "@/domains/automations/AutomationsView"
import { getFlag } from "@/lib/flags"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "automations",
  beforeLoad: () => {
    if (!getFlag("automations")) throw redirect({ to: "/" })
  },
  component: AutomationsView,
})
