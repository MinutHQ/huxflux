import { createRoute, redirect } from "@tanstack/react-router"
import { PRView } from "@/domains/pull-requests/PRView"
import { getFlag } from "@/lib/flags"
import { useAppContext } from "@/hooks/useAppContext"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "review/$prId",
  beforeLoad: () => {
    if (!getFlag("prReview")) throw redirect({ to: "/" })
  },
  component: ReviewRoute,
})

function ReviewRoute() {
  const { prId } = Route.useParams()
  const { prs } = useAppContext()

  const pr = prs.find((p) => p.id === prId) ?? null
  if (!pr) return <div className="flex-1 flex items-center justify-center text-muted-foreground">PR not found</div>

  return (
    <div className="flex-1 min-w-0 overflow-hidden">
      <PRView key={pr.id} pr={pr} />
    </div>
  )
}
