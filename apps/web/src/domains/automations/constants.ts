import {
  IconBolt,
  IconClock,
  IconRefresh,
  IconSchema,
  IconSettings,
  IconTimeline,
  IconActivity,
  IconHandClick,
} from "@tabler/icons-react"
import type { ComponentType } from "react"

export type NodeIconConfig = { icon: ComponentType<{ size?: number; className?: string }>; color: string; bg: string }

export const NODE_CONFIG: Record<string, NodeIconConfig> = {
  trigger: { icon: IconClock, color: "text-purple-400", bg: "bg-purple-500/15" },
  fetch: { icon: IconRefresh, color: "text-blue-400", bg: "bg-blue-500/15" },
  parse: { icon: IconSchema, color: "text-cyan-400", bg: "bg-cyan-500/15" },
  compare: { icon: IconTimeline, color: "text-amber-400", bg: "bg-amber-500/15" },
  transform: { icon: IconSettings, color: "text-orange-400", bg: "bg-orange-500/15" },
  notify: { icon: IconBolt, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  browser: { icon: IconSchema, color: "text-violet-400", bg: "bg-violet-500/15" },
  custom: { icon: IconBolt, color: "text-muted-foreground", bg: "bg-accent" },
}

export const TRIGGERS = [
  { id: "schedule", label: "Schedule", description: "Run on a recurring interval", icon: IconClock, color: "text-purple-400", bg: "bg-purple-500/15" },
  { id: "event", label: "System Event", description: "Triggered by agents, tasks, or PRs", icon: IconActivity, color: "text-blue-400", bg: "bg-blue-500/15" },
  { id: "manual", label: "Manual", description: "Run on demand only", icon: IconHandClick, color: "text-amber-400", bg: "bg-amber-500/15" },
] as const

export const EVENT_OPTIONS = [
  { value: "agent:done", label: "Agent finished" },
  { value: "task:status-changed", label: "Task status changed" },
  { value: "pr:merged", label: "PR merged" },
  { value: "pr:review-requested", label: "PR review requested" },
]

export const INTERVAL_PRESETS = ["5m", "15m", "30m", "1h", "6h", "12h", "1d"]

const MOCK_FOLLOWUP_RESPONSES: Record<string, string> = {
  default: "Got it! I've updated the automation flow. Check the graph on the right to see the changes.",
  schedule: "I've updated the schedule. The trigger node now reflects the new timing.",
  notify: "Done. I've added email notification as an additional step in the pipeline.",
  add: "I've added a new step to the flow. You can see it in the graph on the right.",
  remove: "Removed that step. The remaining steps have been reconnected automatically.",
  change: "Updated! The flow now reflects your changes.",
}

export function getAIResponse(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes("schedule") || lower.includes("every") || lower.includes("interval")) return MOCK_FOLLOWUP_RESPONSES.schedule!
  if (lower.includes("notify") || lower.includes("email") || lower.includes("alert")) return MOCK_FOLLOWUP_RESPONSES.notify!
  if (lower.includes("add") || lower.includes("also") || lower.includes("include")) return MOCK_FOLLOWUP_RESPONSES.add!
  if (lower.includes("remove") || lower.includes("delete") || lower.includes("drop")) return MOCK_FOLLOWUP_RESPONSES.remove!
  if (lower.includes("change") || lower.includes("update") || lower.includes("modify")) return MOCK_FOLLOWUP_RESPONSES.change!
  return MOCK_FOLLOWUP_RESPONSES.default!
}
