import { createRoute, useNavigate } from "@tanstack/react-router"
import { Onboarding } from "@/app-shell/Onboarding"
import { useServers } from "@/hooks/useServers"
import { Route as rootRoute } from "./__root"

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "onboarding",
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const navigate = useNavigate()
  const { refresh } = useServers()

  return (
    <Onboarding
      onComplete={() => {
        refresh()
        navigate({ to: "/" })
      }}
    />
  )
}
