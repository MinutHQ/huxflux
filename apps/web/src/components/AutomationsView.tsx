import { useState, useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@huxflux/ui"
import { api, useAgentEvents } from "@huxflux/shared"
import type { Automation, AutomationStatus } from "@huxflux/shared"
import { useAppContext } from "@/hooks/useAppContext"
import { isTauri } from "@/lib/platform"
import {
  IconPlus,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconClock,
  IconCheck,
  IconX,
  IconCircleX,
  IconLoader2,
  IconBolt,
} from "@tabler/icons-react"

// ── Mock data for development ────────────────────────────────────────────────

const MOCK_AUTOMATIONS: Automation[] = [
  {
    id: "mock-restaurant",
    name: "Restaurant Availability Checker",
    description: "Checks restaurantX.com every hour for new dinner reservation slots on weekends and notifies via email when something opens up.",
    status: "active",
    schedule: "every 1h",
    steps: [
      { id: "s1", type: "trigger", label: "Every 1 hour", config: { interval: "1h" }, position: { x: 0, y: 0 }, connections: ["s2"] },
      { id: "s2", type: "fetch", label: "Fetch reservation page", config: { url: "https://restaurantx.com/reserve" }, position: { x: 0, y: 1 }, connections: ["s3"] },
      { id: "s3", type: "parse", label: "Extract available dates", config: { selector: ".date-slot" }, position: { x: 0, y: 2 }, connections: ["s4"] },
      { id: "s4", type: "compare", label: "Compare with previous", config: {}, position: { x: 0, y: 3 }, connections: ["s5"] },
      { id: "s5", type: "notify", label: "Email if new slots found", config: { channel: "email" }, position: { x: 0, y: 4 }, connections: [] },
    ],
    builderAgentId: null,
    lastRunAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    lastRunStatus: "success",
    runCount: 47,
    runs: [
      { id: "r1", automationId: "mock-restaurant", status: "success", output: "No new slots found", error: null, startedAt: new Date(Date.now() - 25 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 25 * 60_000 + 3200).toISOString() },
      { id: "r2", automationId: "mock-restaurant", status: "success", output: "No new slots found", error: null, startedAt: new Date(Date.now() - 85 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 85 * 60_000 + 2800).toISOString() },
      { id: "r3", automationId: "mock-restaurant", status: "success", output: "Found 2 new slots: Sat 7pm, Sun 6pm. Notification sent.", error: null, startedAt: new Date(Date.now() - 145 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 145 * 60_000 + 4100).toISOString() },
      { id: "r4", automationId: "mock-restaurant", status: "failure", output: null, error: "Timeout: page took >10s to load", startedAt: new Date(Date.now() - 205 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 205 * 60_000 + 10200).toISOString() },
    ],
    createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
  },
  {
    id: "mock-ping",
    name: "API Health Monitor",
    description: "Pings the production API every 5 minutes and alerts if it returns non-200.",
    status: "active",
    schedule: "every 5m",
    steps: [
      { id: "p1", type: "trigger", label: "Every 5 minutes", config: { interval: "5m" }, position: { x: 0, y: 0 }, connections: ["p2"] },
      { id: "p2", type: "fetch", label: "GET /health", config: { url: "https://api.example.com/health" }, position: { x: 0, y: 1 }, connections: ["p3"] },
      { id: "p3", type: "compare", label: "Check status code", config: { expect: 200 }, position: { x: 0, y: 2 }, connections: ["p4"] },
      { id: "p4", type: "notify", label: "Alert if down", config: { channel: "in-app" }, position: { x: 0, y: 3 }, connections: [] },
    ],
    builderAgentId: null,
    lastRunAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    lastRunStatus: "success",
    runCount: 312,
    runs: [],
    createdAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    id: "mock-price",
    name: "Price Drop Watcher",
    description: "Monitors product prices on a shopping site and notifies when they drop below a threshold.",
    status: "paused",
    schedule: "every 6h",
    steps: [
      { id: "d1", type: "trigger", label: "Every 6 hours", config: { interval: "6h" }, position: { x: 0, y: 0 }, connections: ["d2"] },
      { id: "d2", type: "fetch", label: "Scrape product page", config: {}, position: { x: 0, y: 1 }, connections: ["d3"] },
      { id: "d3", type: "parse", label: "Extract price", config: {}, position: { x: 0, y: 2 }, connections: ["d4"] },
      { id: "d4", type: "compare", label: "Below threshold?", config: { threshold: 50 }, position: { x: 0, y: 3 }, connections: ["d5"] },
      { id: "d5", type: "notify", label: "Send alert", config: {}, position: { x: 0, y: 4 }, connections: [] },
    ],
    builderAgentId: null,
    lastRunAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    lastRunStatus: "success",
    runCount: 8,
    runs: [],
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
]

const STATUS_CONFIG: Record<AutomationStatus, { label: string; dotClass: string }> = {
  draft: { label: "Draft", dotClass: "bg-muted-foreground/40" },
  active: { label: "Active", dotClass: "bg-emerald-500" },
  paused: { label: "Paused", dotClass: "bg-amber-400" },
  error: { label: "Error", dotClass: "bg-red-500" },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function AutomationCard({ automation, onSelect, onToggle, onDelete }: {
  automation: Automation
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const status = STATUS_CONFIG[automation.status] ?? STATUS_CONFIG.draft
  const lastRun = automation.lastRunAt ? timeAgo(automation.lastRunAt) : null

  return (
    <div
      onClick={onSelect}
      className={cn(
        "bg-accent/40 border rounded-xl p-4 cursor-pointer hover:bg-accent/60 transition-all group",
        automation.status === "active"
          ? "border-emerald-500/40 hover:border-emerald-500/60"
          : "border-border/40 hover:border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0 mt-0.5">
          <IconBolt size={16} className="text-muted-foreground/60" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-medium text-foreground truncate">{automation.name}</h3>
          {automation.description && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">{automation.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
            title={automation.status === "active" ? "Pause" : "Start"}
          >
            {automation.status === "active" ? <IconPlayerPause size={13} /> : <IconPlayerPlay size={13} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-accent transition-colors"
            title="Delete"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground/50">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", status.dotClass)} />
          <span>{status.label}</span>
        </div>
        {automation.schedule && (
          <div className="flex items-center gap-1">
            <IconClock size={10} />
            <span>{automation.schedule}</span>
          </div>
        )}
        {lastRun && <span>Last run: {lastRun}</span>}
        {automation.runCount > 0 && <span>{automation.runCount} runs</span>}
        {automation.lastRunStatus === "failure" && <IconCircleX size={10} className="text-red-400" />}
        {automation.lastRunStatus === "success" && <IconCheck size={10} className="text-emerald-400" />}
      </div>
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────────────────────

export function AutomationsView() {
  const { sidebarCollapsed } = useAppContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: apiAutomations = [], isLoading: apiLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: () => api.getAutomations(),
  })
  // Merge mock data with real automations for development
  const automations = [...MOCK_AUTOMATIONS, ...apiAutomations]
  const isLoading = apiLoading && apiAutomations.length === 0 && MOCK_AUTOMATIONS.length === 0

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  useAgentEvents(null, useCallback((event: any) => {
    if (event.type?.startsWith("automation:")) {
      queryClient.invalidateQueries({ queryKey: ["automations"] })
    }
  }, [queryClient]))

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const result = await api.createAutomation({ name: newName.trim(), description: newDesc.trim() || undefined })
      queryClient.invalidateQueries({ queryKey: ["automations"] })
      setNewName("")
      setNewDesc("")
      setCreating(false)
      if (result) navigate({ to: "/automations/$automationId", params: { automationId: result.id } })
    } catch (err) {
      const { toast } = await import("sonner")
      toast.error("Failed to create automation")
    }
  }

  const handleToggle = async (automation: Automation) => {
    const newStatus = automation.status === "active" ? "paused" : "active"
    await api.updateAutomation(automation.id, { status: newStatus })
    queryClient.invalidateQueries({ queryKey: ["automations"] })
  }

  const handleDelete = async (id: string) => {
    await api.deleteAutomation(id)
    queryClient.invalidateQueries({ queryKey: ["automations"] })
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className={cn("flex items-center gap-3 px-4 py-1.5 shrink-0", isTauri && "min-h-12", sidebarCollapsed && isTauri && "pl-32")}>
        <h1 className="text-[13px] font-medium text-foreground">Automations</h1>
        <span className="text-[11px] text-muted-foreground/40">{automations.length}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-1 pt-0">
        <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-border/30">
            <div className="flex-1" />
            <Button variant="ghost" size="xs" onClick={() => setCreating(true)}>
              <IconPlus size={12} />
              New automation
            </Button>
          </div>

          {/* Automation list */}
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

      {/* New automation dialog */}
      <Dialog open={creating} onOpenChange={(open) => { if (!open) { setCreating(false); setNewName(""); setNewDesc("") } }}>
        <DialogContent>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <DialogTitle>New automation</DialogTitle>
            <DialogClose className="ml-auto p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors">
              <IconX size={14} />
            </DialogClose>
          </div>
          <div className="px-4">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newName.trim()) void handleCreate()
              }}
              placeholder="Automation name"
              className="w-full bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground/30 outline-none"
            />
          </div>
          <div className="px-4 pt-2 pb-3">
            <textarea
              value={newDesc}
              onChange={(e) => { setNewDesc(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(200, e.target.scrollHeight) + "px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newName.trim()) void handleCreate()
              }}
              placeholder="Describe what you want to automate..."
              rows={2}
              className="w-full bg-transparent text-[13px] text-muted-foreground placeholder:text-muted-foreground/20 outline-none resize-none overflow-hidden"
            />
          </div>
          <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground/30 mr-auto">⌘Enter to create</span>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                newName.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              Create automation
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
