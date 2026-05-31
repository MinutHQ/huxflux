import { createRoute, redirect } from "@tanstack/react-router"
import { TasksView } from "@/domains/tasks/TasksView"
import { getFlag } from "@/lib/flags"
import { Route as appRoute } from "../_app"

export const Route = createRoute({
  getParentRoute: () => appRoute,
  path: "tasks/$taskId",
  beforeLoad: () => {
    if (!getFlag("tasks")) throw redirect({ to: "/" })
  },
  component: function TaskDetailRoute() {
    const { taskId } = Route.useParams()
    return <TasksView initialTaskId={taskId} />
  },
})
