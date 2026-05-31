import { useState } from "react"
import { IconChevronRight, IconX } from "@tabler/icons-react"
import { cn } from "@huxflux/ui"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"

/**
 * Bottom-of-sidebar collapsible panel listing every running dev-server port
 * across all agents (loaded once from the DB then live-updated via the
 * `ports:changed` WS event). Clicking a row navigates to that agent; clicking
 * the port number opens `http://localhost:<port>` in a new tab; the trailing X
 * kills the agent's processes.
 *
 * Hidden when no ports are active to keep the sidebar footer tight.
 */
export function ActiveProcesses() {
  const [collapsed, setCollapsed] = useState(true)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Load ports from DB on mount, then update via WS events
  const { data: ports = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.allPorts(),
    queryFn: () => api.agents.allPorts(),
    staleTime: 30_000,
    on: {
      "ports:changed": (event, h) => {
        h.setData(event.ports ?? [])
      },
    },
  })

  const killProcesses = useHuxfluxMutation<unknown, string>({
    mutationFn: (agentId) => api.agents.killProcesses(agentId),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.agents.allPorts() }), 500)
    },
  })

  if (ports.length === 0) return null

  return (
    <div className="border-t border-sidebar-border shrink-0">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-sidebar-accent/30 transition-colors"
      >
        <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
          <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" style={{ animationDuration: "3s" }} />
          <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground/70 flex-1">
          {ports.length} process{ports.length !== 1 ? "es" : ""}
        </span>
        <IconChevronRight size={11} className={cn("text-muted-foreground/30 transition-transform", !collapsed && "rotate-90")} />
      </button>
      {!collapsed && (
        <div className="pb-1.5">
          {ports.map((p) => (
            <button
              key={`${p.agentId}-${p.port}`}
              onClick={() => navigate({ to: "/agent/$agentId", params: { agentId: p.agentId } })}
              className="group w-full flex items-center gap-2 px-3 py-1.5 mx-1 rounded-md hover:bg-sidebar-accent/40 transition-colors text-left"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span
                className="text-[11px] font-mono text-emerald-400 shrink-0 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); window.open(`http://localhost:${p.port}`, "_blank") }}
                title={`Open localhost:${p.port}`}
              >
                :{p.port}
              </span>
              <span className="text-[10px] text-muted-foreground/50 truncate flex-1">
                {p.agentTitle}
              </span>
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation()
                  killProcesses.mutate(p.agentId)
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-red-400 transition-all shrink-0"
                title="Stop process"
              >
                <IconX size={10} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
