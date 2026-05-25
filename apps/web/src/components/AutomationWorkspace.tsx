import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cn } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { ScrollArea } from "@huxflux/ui"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { api, useAgent } from "@huxflux/shared"
import type { Automation, AutomationStep, AutomationRun } from "@huxflux/shared"
import { ChatView } from "@/components/ChatView"
import { useAppContext } from "@/hooks/useAppContext"
import { isTauri } from "@/lib/platform"
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconCheck,
  IconCircleX,
  IconLoader2,
  IconBolt,
  IconClock,
  IconRefresh,
  IconSettings,
  IconTimeline,
  IconSchema,
  IconArrowRight,
  IconArrowUp,
  IconHandClick,
  IconActivity,
  IconSparkles,
  IconChevronDown,
} from "@tabler/icons-react"

// ── Node type icons & colors ─────────────────────────────────────────────────

const NODE_CONFIG: Record<string, { icon: typeof IconBolt; color: string; bg: string }> = {
  trigger: { icon: IconClock, color: "text-purple-400", bg: "bg-purple-500/15" },
  fetch: { icon: IconRefresh, color: "text-blue-400", bg: "bg-blue-500/15" },
  parse: { icon: IconSchema, color: "text-cyan-400", bg: "bg-cyan-500/15" },
  compare: { icon: IconTimeline, color: "text-amber-400", bg: "bg-amber-500/15" },
  transform: { icon: IconSettings, color: "text-orange-400", bg: "bg-orange-500/15" },
  notify: { icon: IconBolt, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  browser: { icon: IconSchema, color: "text-violet-400", bg: "bg-violet-500/15" },
  custom: { icon: IconBolt, color: "text-muted-foreground", bg: "bg-accent" },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ── Flow Graph ───────────────────────────────────────────────────────────────

function FlowGraph({ steps = [] }: { steps?: AutomationStep[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!steps || steps.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
          <IconSchema size={22} className="text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-foreground">No flow defined yet</p>
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[280px]">
            Use the chat to describe what you want to automate. The AI will build the flow for you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="flex flex-col items-center gap-1">
        {steps.map((step, i) => {
          const config = NODE_CONFIG[step.type] ?? NODE_CONFIG.custom
          const Icon = config.icon
          const isExpanded = expandedId === step.id
          const configEntries = Object.entries(step.config ?? {}).filter(([k, v]) => v && k !== "triggerType")

          return (
            <div key={step.id} className="flex flex-col items-center w-full max-w-xs">
              {i > 0 && (
                <div className="flex flex-col items-center py-1">
                  <div className="w-px h-4 bg-border/50" />
                  <IconArrowRight size={10} className="text-muted-foreground/30 rotate-90" />
                  <div className="w-px h-4 bg-border/50" />
                </div>
              )}
              <button
                onClick={() => setExpandedId(isExpanded ? null : step.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                  isExpanded
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/40 bg-accent/30 hover:bg-accent/50"
                )}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", config.bg)}>
                  <Icon size={16} className={config.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground/50 capitalize">{step.type}</p>
                </div>
                {configEntries.length > 0 && (
                  <IconChevronDown size={12} className={cn("text-muted-foreground/30 transition-transform shrink-0", isExpanded && "rotate-180")} />
                )}
              </button>

              {/* Expanded details */}
              {isExpanded && configEntries.length > 0 && (
                <div className="w-full mt-1 rounded-lg border border-border/30 bg-accent/20 px-3 py-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  {configEntries.map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-[10px]">
                      <span className="text-muted-foreground/50 w-16 shrink-0 capitalize">{key}</span>
                      <span className="text-foreground/80 font-mono break-all">{String(value)}</span>
                    </div>
                  ))}
                  {step.connections.length > 0 && (
                    <div className="flex items-start gap-2 text-[10px] pt-1 border-t border-border/20">
                      <span className="text-muted-foreground/50 w-16 shrink-0">Next</span>
                      <span className="text-muted-foreground/60 font-mono">{step.connections.join(", ")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Runs List ────────────────────────────────────────────────────────────────

function RunsList({ runs = [] }: { runs?: AutomationRun[] }) {
  if (!runs || runs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
        <p className="text-[12px] text-muted-foreground/50">No runs yet</p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-1">
        {runs.map((run) => (
          <div key={run.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors">
            {run.status === "success" ? (
              <IconCheck size={13} className="text-emerald-400 shrink-0" />
            ) : run.status === "failure" ? (
              <IconCircleX size={13} className="text-red-400 shrink-0" />
            ) : (
              <IconLoader2 size={13} className="text-amber-400 animate-spin shrink-0" />
            )}
            <span className="text-[11px] text-muted-foreground/60 shrink-0 w-16">{timeAgo(run.startedAt)}</span>
            {run.finishedAt && run.startedAt && (
              <span className="text-[10px] text-muted-foreground/30 shrink-0">
                {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
              </span>
            )}
            <div className="flex-1 min-w-0">
              {run.error && <span className="text-[10px] text-red-400/70 truncate block">{run.error}</span>}
              {run.output && !run.error && <span className="text-[10px] text-muted-foreground/40 truncate block">{run.output.slice(0, 100)}</span>}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

// ── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ automation, onUpdate }: {
  automation: Automation
  onUpdate: (updates: Partial<{ name: string; description: string; schedule: string }>) => void
}) {
  const [name, setName] = useState(automation.name)
  const [desc, setDesc] = useState(automation.description ?? "")
  const [model, setModel] = useState("Sonnet 4.6")
  const [provider, setProvider] = useState("claude")

  useEffect(() => { setName(automation.name); setDesc(automation.description ?? "") }, [automation.id])

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== automation.name) onUpdate({ name: name.trim() }) }}
            className="w-full bg-accent/30 border border-border/40 rounded-lg px-3 py-2 text-[12px] text-foreground outline-none focus:border-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Description</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => { if (desc !== (automation.description ?? "")) onUpdate({ description: desc }) }}
            rows={3}
            className="w-full bg-accent/30 border border-border/40 rounded-lg px-3 py-2 text-[12px] text-foreground outline-none focus:border-ring resize-none"
          />
        </div>

        {/* AI Model & Provider */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">AI Model</label>
          <div className="flex gap-2">
            {["Sonnet 4.6", "Opus 4.6", "Haiku 4.5"].map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors",
                  model === m ? "bg-primary/15 text-foreground border-primary/30" : "bg-accent/30 text-muted-foreground/60 border-border/40 hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Provider</label>
          <div className="flex gap-2">
            {["claude", "claude-interactive"].map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors capitalize",
                  provider === p ? "bg-primary/15 text-foreground border-primary/30" : "bg-accent/30 text-muted-foreground/60 border-border/40 hover:text-foreground"
                )}
              >
                {p === "claude-interactive" ? "Claude (Interactive)" : "Claude"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Created</label>
          <p className="text-[12px] text-muted-foreground">{new Date(automation.createdAt).toLocaleString()}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Total runs</label>
          <p className="text-[12px] text-muted-foreground">{automation.runCount}</p>
        </div>
      </div>
    </ScrollArea>
  )
}

// ── Mock data (same as list view) ─────────────────────────────────────────────

const MOCK_AUTOMATIONS: Record<string, Automation> = {
  "mock-restaurant": {
    id: "mock-restaurant",
    name: "Restaurant Availability Checker",
    description: "Checks restaurantX.com every hour for new dinner reservation slots on weekends.",
    status: "active",
    schedule: "every 1h",
    steps: [
      { id: "s1", type: "trigger", label: "Every 1 hour", config: { interval: "1h" }, position: { x: 0, y: 0 }, connections: ["s2"] },
      { id: "s2", type: "fetch", label: "Fetch reservation page", config: { url: "https://restaurantx.com/reserve" }, position: { x: 0, y: 1 }, connections: ["s3"] },
      { id: "s3", type: "parse", label: "Extract available dates", config: { selector: ".date-slot" }, position: { x: 0, y: 2 }, connections: ["s4"] },
      { id: "s4", type: "compare", label: "Compare with previous", config: {}, position: { x: 0, y: 3 }, connections: ["s5"] },
      { id: "s5", type: "notify", label: "Email if new slots found", config: { channel: "email" }, position: { x: 0, y: 4 }, connections: [] },
    ],
    builderAgentId: null, lastRunAt: new Date(Date.now() - 25 * 60_000).toISOString(), lastRunStatus: "success", runCount: 47,
    runs: [
      { id: "r1", automationId: "mock-restaurant", status: "success", output: "No new slots found", error: null, startedAt: new Date(Date.now() - 25 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 25 * 60_000 + 3200).toISOString() },
      { id: "r2", automationId: "mock-restaurant", status: "success", output: "No new slots found", error: null, startedAt: new Date(Date.now() - 85 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 85 * 60_000 + 2800).toISOString() },
      { id: "r3", automationId: "mock-restaurant", status: "success", output: "Found 2 new slots: Sat 7pm, Sun 6pm. Notification sent.", error: null, startedAt: new Date(Date.now() - 145 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 145 * 60_000 + 4100).toISOString() },
      { id: "r4", automationId: "mock-restaurant", status: "failure", output: null, error: "Timeout: page took >10s to load", startedAt: new Date(Date.now() - 205 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 205 * 60_000 + 10200).toISOString() },
    ],
    createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(), updatedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
  },
  "mock-ping": {
    id: "mock-ping",
    name: "API Health Monitor",
    description: "Pings the production API every 5 minutes and alerts if it returns non-200.",
    status: "active", schedule: "every 5m",
    steps: [
      { id: "p1", type: "trigger", label: "Every 5 minutes", config: {}, position: { x: 0, y: 0 }, connections: ["p2"] },
      { id: "p2", type: "fetch", label: "GET /health", config: {}, position: { x: 0, y: 1 }, connections: ["p3"] },
      { id: "p3", type: "compare", label: "Check status code", config: {}, position: { x: 0, y: 2 }, connections: ["p4"] },
      { id: "p4", type: "notify", label: "Alert if down", config: {}, position: { x: 0, y: 3 }, connections: [] },
    ],
    builderAgentId: null, lastRunAt: new Date(Date.now() - 3 * 60_000).toISOString(), lastRunStatus: "success", runCount: 312,
    runs: [
      { id: "pr1", automationId: "mock-ping", status: "success", output: "200 OK (142ms)", error: null, startedAt: new Date(Date.now() - 3 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 3 * 60_000 + 500).toISOString() },
      { id: "pr2", automationId: "mock-ping", status: "success", output: "200 OK (98ms)", error: null, startedAt: new Date(Date.now() - 8 * 60_000).toISOString(), finishedAt: new Date(Date.now() - 8 * 60_000 + 400).toISOString() },
    ],
    createdAt: new Date(Date.now() - 14 * 86_400_000).toISOString(), updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  "mock-price": {
    id: "mock-price",
    name: "Price Drop Watcher",
    description: "Monitors product prices and notifies when they drop below threshold.",
    status: "paused", schedule: "every 6h",
    steps: [
      { id: "d1", type: "trigger", label: "Every 6 hours", config: {}, position: { x: 0, y: 0 }, connections: ["d2"] },
      { id: "d2", type: "fetch", label: "Scrape product page", config: {}, position: { x: 0, y: 1 }, connections: ["d3"] },
      { id: "d3", type: "parse", label: "Extract price", config: {}, position: { x: 0, y: 2 }, connections: ["d4"] },
      { id: "d4", type: "compare", label: "Below threshold?", config: {}, position: { x: 0, y: 3 }, connections: ["d5"] },
      { id: "d5", type: "notify", label: "Send alert", config: {}, position: { x: 0, y: 4 }, connections: [] },
    ],
    builderAgentId: null, lastRunAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), lastRunStatus: "success", runCount: 8, runs: [],
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
}

// ── Trigger options ──────────────────────────────────────────────────────────

const TRIGGERS = [
  { id: "schedule", label: "Schedule", description: "Run on a recurring interval", icon: IconClock, color: "text-purple-400", bg: "bg-purple-500/15" },
  { id: "event", label: "System Event", description: "Triggered by agents, tasks, or PRs", icon: IconActivity, color: "text-blue-400", bg: "bg-blue-500/15" },
  { id: "manual", label: "Manual", description: "Run on demand only", icon: IconHandClick, color: "text-amber-400", bg: "bg-amber-500/15" },
] as const

const EVENT_OPTIONS = [
  { value: "agent:done", label: "Agent finished" },
  { value: "task:status-changed", label: "Task status changed" },
  { value: "pr:merged", label: "PR merged" },
  { value: "pr:review-requested", label: "PR review requested" },
]

const INTERVAL_PRESETS = ["5m", "15m", "30m", "1h", "6h", "12h", "1d"]

// ── Guided Setup ────────────────────────────────────────────────────────────

type SetupPhase = "trigger" | "describe" | "building" | "questions" | "done"

interface MockQuestion {
  id: string
  question: string
  type: "text" | "choice"
  options?: string[]
  answer?: string
}

interface ChatMessage {
  id: string
  role: "user" | "ai"
  content: string
}

const MOCK_FOLLOWUP_RESPONSES: Record<string, string> = {
  "default": "Got it! I've updated the automation flow. Check the graph on the right to see the changes.",
  "schedule": "I've updated the schedule. The trigger node now reflects the new timing.",
  "notify": "Done. I've added email notification as an additional step in the pipeline.",
  "add": "I've added a new step to the flow. You can see it in the graph on the right.",
  "remove": "Removed that step. The remaining steps have been reconnected automatically.",
  "change": "Updated! The flow now reflects your changes.",
}

function getAIResponse(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes("schedule") || lower.includes("every") || lower.includes("interval")) return MOCK_FOLLOWUP_RESPONSES.schedule
  if (lower.includes("notify") || lower.includes("email") || lower.includes("alert")) return MOCK_FOLLOWUP_RESPONSES.notify
  if (lower.includes("add") || lower.includes("also") || lower.includes("include")) return MOCK_FOLLOWUP_RESPONSES.add
  if (lower.includes("remove") || lower.includes("delete") || lower.includes("drop")) return MOCK_FOLLOWUP_RESPONSES.remove
  if (lower.includes("change") || lower.includes("update") || lower.includes("modify")) return MOCK_FOLLOWUP_RESPONSES.change
  return MOCK_FOLLOWUP_RESPONSES.default
}

function GuidedSetup({ onComplete, onInitChat }: {
  onComplete: (config: { trigger: string; triggerConfig: Record<string, string>; description: string; steps: AutomationStep[] }) => void
  onInitChat: (msg: string) => void
}) {
  const [phase, setPhase] = useState<SetupPhase>("trigger")
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null)
  const [interval, setInterval] = useState("1h")
  const [eventType, setEventType] = useState("")
  const [description, setDescription] = useState("")
  const [questions, setQuestions] = useState<MockQuestion[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [buildProgress, setBuildProgress] = useState(0)
  const [generatedSteps, setGeneratedSteps] = useState<AutomationStep[]>([])

  const handleTriggerSelect = (id: string) => {
    setSelectedTrigger(id)
    if (id === "manual") {
      // Skip config, go straight to describe
      setPhase("describe")
    }
  }

  const handleTriggerConfirm = () => {
    setPhase("describe")
  }

  const handleDescribe = () => {
    if (!description.trim()) return
    setPhase("building")

    // Simulate AI building: progress bar, then questions
    let progress = 0
    const timer = window.setInterval(() => {
      progress += 15
      setBuildProgress(Math.min(progress, 100))
      if (progress >= 100) {
        window.clearInterval(timer)
        // Generate mock questions based on description
        const mockQuestions: MockQuestion[] = [
          { id: "q1", question: "Which URL should I monitor?", type: "text" },
          { id: "q2", question: "How should I notify you when something is found?", type: "choice", options: ["In-app notification", "Log only", "Create a task"] },
        ]
        setQuestions(mockQuestions)
        setPhase("questions")
      }
    }, 300)
  }

  const handleAnswer = (answer: string) => {
    const updated = [...questions]
    updated[currentQ] = { ...updated[currentQ], answer }
    setQuestions(updated)

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      // All questions answered, generate flow
      setPhase("building")
      setBuildProgress(0)

      let progress = 0
      const timer = window.setInterval(() => {
        progress += 20
        setBuildProgress(Math.min(progress, 100))
        if (progress >= 100) {
          window.clearInterval(timer)

          const triggerLabel = selectedTrigger === "schedule" ? `Every ${interval}`
            : selectedTrigger === "event" ? EVENT_OPTIONS.find(e => e.value === eventType)?.label ?? "System event"
            : "Manual trigger"

          const steps: AutomationStep[] = [
            { id: "t1", type: "trigger", label: triggerLabel, config: { trigger: selectedTrigger!, interval, eventType }, position: { x: 0, y: 0 }, connections: ["a1"] },
            { id: "a1", type: "fetch", label: "Fetch data", config: { url: updated[0]?.answer ?? "" }, position: { x: 0, y: 1 }, connections: ["a2"] },
            { id: "a2", type: "parse", label: "Extract information", config: {}, position: { x: 0, y: 2 }, connections: ["a3"] },
            { id: "a3", type: "compare", label: "Check for changes", config: {}, position: { x: 0, y: 3 }, connections: ["a4"] },
            { id: "a4", type: "notify", label: updated[1]?.answer ?? "Notify", config: { method: updated[1]?.answer ?? "in-app" }, position: { x: 0, y: 4 }, connections: [] },
          ]
          setGeneratedSteps(steps)
          setPhase("done")
          onComplete({
            trigger: selectedTrigger!,
            triggerConfig: { interval, eventType },
            description,
            steps,
          })
        }
      }, 250)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="px-5 py-6 space-y-6 max-w-md mx-auto">
          {/* Step 1: Trigger */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-muted-foreground">1</div>
              <h3 className="text-[12px] font-medium text-foreground">What should trigger this automation?</h3>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {TRIGGERS.map((trigger) => {
                const Icon = trigger.icon
                const isSelected = selectedTrigger === trigger.id
                return (
                  <button
                    key={trigger.id}
                    onClick={() => handleTriggerSelect(trigger.id)}
                    disabled={phase !== "trigger" && !isSelected}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                      isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/40 hover:border-border hover:bg-accent/30",
                      phase !== "trigger" && !isSelected && "opacity-30 cursor-not-allowed"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", trigger.bg)}>
                      <Icon size={16} className={trigger.color} />
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-foreground">{trigger.label}</p>
                      <p className="text-[10px] text-muted-foreground/60">{trigger.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Trigger config */}
            {selectedTrigger === "schedule" && phase === "trigger" && (
              <div className="pl-7 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Run every</label>
                <div className="flex flex-wrap gap-1.5">
                  {INTERVAL_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setInterval(preset)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors",
                        interval === preset ? "bg-primary/15 text-foreground border border-primary/30" : "bg-accent/40 text-muted-foreground/60 hover:text-foreground border border-transparent"
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <button onClick={handleTriggerConfirm} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors mt-2">
                  Continue
                </button>
              </div>
            )}

            {selectedTrigger === "event" && phase === "trigger" && (
              <div className="pl-7 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">When</label>
                <div className="space-y-1">
                  {EVENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setEventType(opt.value)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-left transition-colors",
                        eventType === opt.value ? "bg-primary/15 text-foreground border border-primary/30" : "bg-accent/40 text-muted-foreground/60 hover:text-foreground border border-transparent"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button onClick={handleTriggerConfirm} disabled={!eventType} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors mt-2", eventType ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground/40 cursor-not-allowed")}>
                  Continue
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Describe */}
          {(phase === "describe" || phase === "building" || phase === "questions" || phase === "done") && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-muted-foreground">2</div>
                <h3 className="text-[12px] font-medium text-foreground">What should happen?</h3>
              </div>
              <textarea
                value={description}
                onChange={(e) => { setDescription(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px" }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleDescribe() }}
                placeholder="Describe what this automation should do..."
                rows={3}
                disabled={phase !== "describe"}
                className="w-full bg-accent/20 border border-border/40 rounded-xl px-3 py-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/30 outline-none resize-none focus:border-ring/50 disabled:opacity-60 transition-all"
              />
              {phase === "describe" && (
                <button onClick={handleDescribe} disabled={!description.trim()} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors", description.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground/40 cursor-not-allowed")}>
                  <IconSparkles size={12} />
                  Build automation
                </button>
              )}
            </div>
          )}

          {/* Building progress */}
          {phase === "building" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <IconLoader2 size={14} className="text-primary animate-spin" />
                <span className="text-[12px] text-muted-foreground">AI is building your automation...</span>
              </div>
              <div className="h-1 bg-accent rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${buildProgress}%` }} />
              </div>
            </div>
          )}

          {/* Step 3: Questions */}
          {phase === "questions" && questions[currentQ] && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-muted-foreground">3</div>
                <h3 className="text-[12px] font-medium text-foreground">A few questions</h3>
                <span className="text-[10px] text-muted-foreground/40 ml-auto">{currentQ + 1}/{questions.length}</span>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <IconSparkles size={14} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[12px] text-foreground leading-relaxed">{questions[currentQ].question}</p>
                </div>
                {questions[currentQ].type === "text" ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") handleAnswer((e.target as HTMLInputElement).value) }}
                      placeholder="Type your answer..."
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
                    />
                    <button
                      onClick={(e) => {
                        const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
                        if (input?.value.trim()) handleAnswer(input.value.trim())
                      }}
                      className="p-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors shrink-0"
                    >
                      <IconArrowUp size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {questions[currentQ].options?.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleAnswer(opt)}
                        className="w-full text-left px-3 py-2 rounded-lg text-[11px] border border-border/40 hover:bg-accent/30 hover:border-border transition-colors"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </ScrollArea>
    </div>
  )
}

// ── Mock Chat (fallback when no real agent) ──────────────────────────────────

function MockChat({ onInitBuilder }: { onInitBuilder: (msg?: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [aiTyping, setAiTyping] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Elapsed timer while AI is typing
  useEffect(() => {
    if (!aiTyping) { setElapsed(0); return }
    const t = window.setInterval(() => setElapsed(s => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [aiTyping])

  const handleSend = (msg: string) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: msg }
    setMessages(prev => [...prev, userMsg])
    setAiTyping(true)

    setTimeout(() => {
      const aiMsg: ChatMessage = { id: `a-${Date.now()}`, role: "ai", content: getAIResponse(msg) }
      setMessages(prev => [...prev, aiMsg])
      setAiTyping(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    }, 1500 + Math.random() * 1000)

    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    onInitBuilder(msg)
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0")
  const ss = String(elapsed % 60).padStart(2, "0")

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-10 py-8">
          {/* Initial AI message */}
          <div className="mb-5 max-w-4xl">
            <p className="text-sm text-foreground leading-relaxed">
              Your automation flow has been created. You can review the pipeline on the right. Ask me to make changes, add steps, or adjust the configuration.
            </p>
          </div>

          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="mb-5 ml-auto w-fit max-w-[80%] bg-card border border-border rounded-xl px-5 py-4">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            ) : (
              <div key={msg.id} className="mb-5 max-w-4xl">
                <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <span className="text-[11px] text-muted-foreground/50">1s</span>
                </div>
              </div>
            )
          )}

          {/* Typing indicator — matches agent chat exactly */}
          {aiTyping && (
            <div className="mb-5">
              <div className="inline-flex items-center gap-2 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-muted-foreground/30"
                    style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.18}s infinite` }}
                  />
                ))}
                <span className="text-[11px] font-mono text-muted-foreground/40 tabular-nums ml-0.5">{mm}:{ss}</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <BuilderInput onSend={handleSend} />
    </div>
  )
}

// ── Builder Input (matches agent chat input style) ───────────────────────────

function BuilderInput({ onSend }: { onSend: (message: string) => void }) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = async () => {
    const trimmed = value.trim()
    if (!trimmed || sending) return
    setSending(true)
    setValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    await onSend(trimmed)
    setSending(false)
  }

  return (
    <div className="shrink-0 px-4 py-3">
      <div className="relative border border-border/40 rounded-2xl shadow-sm focus-within:shadow-md focus-within:border-ring/50 transition-all overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend() }
          }}
          placeholder="Describe what you want to automate..."
          rows={2}
          disabled={sending}
          className="w-full bg-transparent px-4 pt-3 pb-10 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none resize-none overflow-hidden disabled:opacity-50"
        />
        <div className="absolute bottom-2 right-2">
          <button
            onClick={handleSend}
            disabled={!value.trim() || sending}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              value.trim() && !sending
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            {sending ? <IconLoader2 size={14} className="animate-spin" /> : <IconArrowUp size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Workspace ───────────────────────────────────────────────────────────

export function AutomationWorkspace({ automationId }: { automationId: string }) {
  const { sidebarCollapsed } = useAppContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"flow" | "runs" | "settings">("flow")
  const [running, setRunning] = useState(false)
  const [setupSteps, setSetupSteps] = useState<AutomationStep[]>([])
  const [setupDone, setSetupDone] = useState(false)

  const isMock = automationId in MOCK_AUTOMATIONS
  const [builderAgentId, setBuilderAgentId] = useState<string | null>(null)
  const { data: builderAgent, isStreaming, loadMore, hasMore, isLoadingMore } = useAgent(builderAgentId)

  const { data: apiAutomation } = useQuery({
    queryKey: ["automation", automationId],
    queryFn: () => api.getAutomation(automationId),
    enabled: !isMock,
    staleTime: 2_000,
    refetchInterval: isStreaming ? 3_000 : false,
  })
  const automation = isMock ? MOCK_AUTOMATIONS[automationId] : apiAutomation ?? null

  useEffect(() => {
    if (automation?.builderAgentId && !builderAgentId) setBuilderAgentId(automation.builderAgentId)
  }, [automation?.builderAgentId, builderAgentId])

  // Initialize builder agent on first chat
  const initBuilder = useCallback(async (message?: string) => {
    if (builderAgentId) return builderAgentId
    try {
      const result = await api.replyToAutomationBuilder(automationId, message ?? "")
      setBuilderAgentId(result.agentId)
      return result.agentId
    } catch { return null }
  }, [automationId, builderAgentId])

  const handleUpdate = async (updates: Partial<{ name: string; description: string; status: string; schedule: string }>) => {
    await api.updateAutomation(automationId, updates)
    queryClient.invalidateQueries({ queryKey: ["automation", automationId] })
    queryClient.invalidateQueries({ queryKey: ["automations"] })
  }

  const handleRun = async () => {
    setRunning(true)
    try {
      await api.runAutomation(automationId)
      queryClient.invalidateQueries({ queryKey: ["automation", automationId] })
    } finally {
      setRunning(false)
    }
  }

  const handleDelete = async () => {
    await api.deleteAutomation(automationId)
    queryClient.invalidateQueries({ queryKey: ["automations"] })
    navigate({ to: "/automations" })
  }

  if (!automation) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconLoader2 size={20} className="text-muted-foreground/40 animate-spin" />
      </div>
    )
  }

  const isActive = automation.status === "active"

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className={cn("flex items-center gap-3 px-4 py-1.5 shrink-0", isTauri && "min-h-12", sidebarCollapsed && isTauri && "pl-32")}>
        <button onClick={() => navigate({ to: "/automations" })} className="text-muted-foreground/50 hover:text-foreground transition-colors">
          <IconArrowLeft size={14} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <IconBolt size={14} className="text-muted-foreground/50 shrink-0" />
          <span className="text-[13px] font-medium text-foreground truncate">{automation.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="xs" onClick={() => isActive ? handleUpdate({ status: "paused" }) : handleUpdate({ status: "active" })}>
            {isActive ? <><IconPlayerPause size={12} /> Pause</> : <><IconPlayerPlay size={12} /> Activate</>}
          </Button>
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
          >
            {running ? <IconLoader2 size={12} className="animate-spin" /> : <IconRefresh size={12} />}
            Run now
          </button>
          <button onClick={handleDelete} className="p-1 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-accent transition-colors">
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      {/* Content: chat left, flow/runs/settings right */}
      <div className="flex-1 min-h-0 p-1 pt-0">
        <ResizablePanelGroup orientation="horizontal" className="h-full gap-1">
          {/* Left panel: builder chat */}
          <ResizablePanel defaultSize={50} minSize="30">
            <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden">
          {builderAgent && (builderAgent.messages.length > 0 || isStreaming) ? (
            <ChatView
              agent={builderAgent}
              isStreaming={isStreaming}
              loadMore={loadMore}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              openFileTab={null}
              onClearFileTab={() => {}}
              hideChrome
              hideHeader
            />
          ) : !setupDone && (automation?.steps ?? []).length === 0 ? (
            <GuidedSetup
              onComplete={(config) => {
                setSetupSteps(config.steps)
                setSetupDone(true)
                // Create builder agent with the setup context
                const triggerDesc = config.trigger === "schedule" ? `Run every ${config.triggerConfig.interval}`
                  : config.trigger === "event" ? `Triggered by: ${config.triggerConfig.eventType}`
                  : "Manual trigger"
                const msg = `Set up this automation:\n\nTrigger: ${triggerDesc}\n\nWhat it should do: ${config.description}`
                initBuilder(msg).catch(() => {})
              }}
              onInitChat={async (msg) => { await initBuilder(msg) }}
            />
          ) : (
            <MockChat onInitBuilder={async (msg) => { await initBuilder(msg) }} />
          )}
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-0 bg-transparent" />

          {/* Right panel: tabs */}
          <ResizablePanel defaultSize={50} minSize="25">
            <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden flex flex-col">
          {/* Tab bar */}
          <div className="relative flex items-center shrink-0 px-2 pb-1.5 pt-1 gap-1">
            <div className="absolute inset-0 bg-gradient-to-b from-primary-foreground/[0.04] to-transparent pointer-events-none" />
            {(["flow", "runs", "settings"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors capitalize",
                  activeTab === tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
                )}
              >
                {tab}
                {tab === "runs" && automation.runCount > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/40">{automation.runCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "flow" && <FlowGraph steps={(automation.steps?.length ?? 0) > 0 ? automation.steps! : setupSteps} />}
          {activeTab === "runs" && <RunsList runs={automation.runs ?? []} />}
          {activeTab === "settings" && <SettingsPanel automation={automation} onUpdate={handleUpdate} />}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
