import { createRouter, createHashHistory } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { isTauri } from "@/lib/platform"

import { Route as rootRoute } from "./routes/__root"
import { Route as appRoute } from "./routes/_app"
import { Route as settingsRoute, settingsChildren } from "./routes/settings"
import { Route as onboardingRoute } from "./routes/onboarding"
import { Route as homeRoute } from "./routes/_app/index"
import { Route as tasksRoute } from "./routes/_app/tasks"
import { Route as taskDetailRoute } from "./routes/_app/tasks_.$taskId"
import { Route as agentRoute } from "./routes/_app/agent.$agentId"
import { Route as agentSetupRoute } from "./routes/_app/agent.setup"
import { Route as agentTeardownRoute } from "./routes/_app/agent.teardown"
import { Route as reviewRoute } from "./routes/_app/review.$prId"
import { Route as refineRoute } from "./routes/_app/refine.$sessionId"
import { Route as automationsRoute } from "./routes/_app/automations"
import { Route as automationDetailRoute } from "./routes/_app/automations_.$automationId"

const routeTree = rootRoute.addChildren([
  settingsRoute.addChildren(settingsChildren),
  onboardingRoute,
  appRoute.addChildren([
    homeRoute,
    tasksRoute,
    taskDetailRoute,
    agentRoute,
    agentSetupRoute,
    agentTeardownRoute,
    reviewRoute,
    refineRoute,
    automationsRoute,
    automationDetailRoute,
  ]),
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history: isTauri ? createHashHistory() : undefined,
    defaultPreload: "intent",
  })
}

// Type registration
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
