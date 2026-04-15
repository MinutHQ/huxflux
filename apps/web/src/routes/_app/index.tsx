import { createRoute } from "@tanstack/react-router"
import { HomeView } from "@/components/HomeView"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: HomeView,
})
