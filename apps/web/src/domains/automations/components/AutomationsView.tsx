import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { api, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import type { Automation } from "@huxflux/shared"
import { useAppContext } from "@/hooks/useAppContext"
import { isTauri } from "@/lib/platform"
import { IconPlus, IconLoader2, IconBolt } from "@tabler/icons-react"
import { AutomationCard } from "./AutomationCard"
import { NewAutomationDialog } from "./NewAutomationDialog"
import { MOCK_AUTOMATIONS } from "../mockData"

export function AutomationsView() {
  const { sidebarCollapsed } = useAppContext()
  const navigate = useNavigate()
  const invalidateAutomations = (_e: unknown, h: { invalidate: () => void }) => { h.invalidate() }
  const { data: apiAutomations = [], isLoading: apiLoading } = useHuxfluxQuery({
    queryKey: queryKeys.automations.list(),
    queryFn: () => api.automations.list(),
    on: {
      "automation:created": invalidateAutomations,
      "automation:updated": invalidateAutomations,
      "automation:deleted": invalidateAutomations,
      "automation:run-started": invalidateAutomations,
      "automation:run-completed": invalidateAutomations,
      "automation:notification": invalidateAutomations,
    },
  })
  // Merge mock data with real automations for development.
  const automations = [...MOCK_AUTOMATIONS, ...apiAutomations]
  const isLoading = apiLoading && apiAutomations.length === 0 && MOCK_AUTOMATIONS.length === 0
  const [creating, setCreating] = useState(false)

  const createAutomation = useHuxfluxMutation<Automation, { name: string; description?: string }>({
    mutationFn: (input) => api.automations.create(input),
    invalidate: () => queryKeys.automations.list(),
    onSuccess: (result) => {
      setCreating(false)
      if (result) navigate({ to: "/automations/$automationId", params: { automationId: result.id } })
    },
    onError: async () => {
      const { toast } = await import("sonner")
      toast.error("Failed to create automation")
    },
  })

  const toggleAutomation = useHuxfluxMutation<Automation, Automation>({
    mutationFn: (automation) => {
      const newStatus = automation.status === "active" ? "paused" : "active"
      return api.automations.update(automation.id, { status: newStatus })
    },
    invalidate: () => queryKeys.automations.list(),
  })

  const deleteAutomation = useHuxfluxMutation<void, string>({
    mutationFn: (id) => api.automations.delete(id),
    invalidate: () => queryKeys.automations.list(),
  })

  const handleCreate = (input: { name: string; description?: string }) => {
    createAutomation.mutate(input)
  }
  const handleToggle = (automation: Automation) => toggleAutomation.mutate(automation)
  const handleDelete = (id: string) => deleteAutomation.mutate(id)

  return (
    <div className="flex flex-col h-full w-full">
      <div className={cn("flex items-center gap-3 px-4 py-1.5 shrink-0", isTauri && "min-h-12", sidebarCollapsed && isTauri && "pl-32")}>
        <h1 className="text-[13px] font-medium text-foreground">Automations</h1>
        <span className="text-[11px] text-muted-foreground/40">{automations.length}</span>
      </div>

      <div className="flex-1 min-h-0 p-1 pt-0">
        <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-border/30">
            <div className="flex-1" />
            <Button variant="ghost" size="xs" onClick={() => setCreating(true)}>
              <IconPlus size={12} />
              New automation
            </Button>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <IconLoader2 size={20} className="text-muted-foreground/40 animate-spin" />
            </div>
          ) : automations.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                <IconBolt size={22} className="text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-[13px] font-medium text-foreground">No automations yet</p>
                <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[280px]">
                  Create an automation to run tasks on a schedule. Describe what you need in natural language.
                </p>
              </div>
              <Button variant="ghost" size="xs" onClick={() => setCreating(true)} className="mt-1">
                <IconPlus size={12} />
                Create your first automation
              </Button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                {automations.map((automation) => (
                  <AutomationCard
                    key={automation.id}
                    automation={automation}
                    onSelect={() => navigate({ to: "/automations/$automationId", params: { automationId: automation.id } })}
                    onToggle={() => handleToggle(automation)}
                    onDelete={() => handleDelete(automation.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <NewAutomationDialog open={creating} onOpenChange={setCreating} onCreate={handleCreate} />
    </div>
  )
}
