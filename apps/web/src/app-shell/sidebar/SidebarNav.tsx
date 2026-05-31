import { IconHome, IconLayoutKanban } from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import { useNavigate, useMatchRoute } from "@tanstack/react-router"
import { getFlag } from "@/lib/flags"

/**
 * Quick-navigation buttons at the top of the sidebar: Home, and (behind the
 * `tasks` flag) Tasks. Each highlights when the active route matches.
 *
 * Lives in app-shell because these are global navigation links, not part of
 * any single feature domain.
 */
export function SidebarNav() {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const tasksEnabled = getFlag("tasks")
  const showHome = !!matchRoute({ to: "/", fuzzy: false })
  const showTasks = !!matchRoute({ to: "/tasks", fuzzy: true })

  return (
    <>
      <div className="px-2 pt-2 shrink-0">
        <button
          onClick={() => navigate({ to: "/" })}
          className={cn(
            "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
            showHome
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <IconHome size={14} />
          Home
        </button>
      </div>

      {tasksEnabled && (
        <div className="px-2 pt-1 shrink-0">
          <button
            onClick={() => navigate({ to: "/tasks" })}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              showTasks
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <IconLayoutKanban size={14} />
            Tasks
          </button>
        </div>
      )}
    </>
  )
}
