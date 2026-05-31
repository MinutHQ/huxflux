// Domain-internal pure helpers for the mobile agents domain.

import { prefs } from "@/lib/prefs"
import type { Message, ToolCall } from "@huxflux/shared"
import type { TeamAgent } from "./agents.types"

export const CLAUDE_CONTEXT_TOKENS = 200_000

export const MODELS = [
  { id: "claude-opus-4-7",           label: "Opus 4.7"   },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6" },
  { id: "claude-opus-4-6",           label: "Opus 4.6"   },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5"  },
]

export function shortModel(modelId: string) {
  return MODELS.find((m) => m.id === modelId)?.label ?? modelId.split("-").slice(-2).join(" ")
}

const STRIP_PATTERN = /^(You'?re? absolutely right[!.]?\s*|I apologize[,.]?\s*you'?re? (absolutely |completely |entirely )?right[!.]?\s*)/i

export function stripSycophancy(text: string): string {
  if (!prefs.getStripYoureRight()) return text
  return text.replace(STRIP_PATTERN, "")
}

export function truncateArgs(args: string, max = 52) {
  return args.length > max ? args.slice(0, max) + "…" : args
}

export function basename(p: string): string {
  if (!p) return ""
  const parts = p.split("/")
  return parts[parts.length - 1] || p
}

export function formatToolCall(tool: string, args?: string): { title: string; detail: string } {
  if (!args) return { title: tool, detail: "" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed tool args are genuinely arbitrary JSON
  let parsed: any
  try {
    parsed = JSON.parse(args)
  } catch {
    return { title: tool, detail: truncateArgs(args) }
  }
  const desc = typeof parsed?.description === "string" ? parsed.description.trim() : ""
  switch (tool) {
    case "Bash": {
      const cmd = String(parsed.command ?? "").trim()
      if (desc) return { title: desc, detail: truncateArgs(cmd) }
      const m = cmd.match(/^(\S+)\s*([\s\S]*)$/)
      if (!m) return { title: "Bash", detail: "" }
      return { title: m[1], detail: truncateArgs(m[2]) }
    }
    case "Grep":
      return { title: desc || "grep", detail: truncateArgs(`"${parsed.pattern ?? ""}"${parsed.path ? ` in ${basename(String(parsed.path))}` : parsed.glob ? ` in ${parsed.glob}` : ""}`) }
    case "Glob":
      return { title: desc || "glob", detail: truncateArgs(String(parsed.pattern ?? "")) }
    case "Read":
      return { title: desc || "Read", detail: basename(String(parsed.file_path ?? "")) }
    case "Write":
      return { title: desc || "Write", detail: basename(String(parsed.file_path ?? "")) }
    case "Edit":
      return { title: desc || "Edit", detail: basename(String(parsed.file_path ?? "")) }
    case "TodoWrite":
      return { title: desc || "TodoWrite", detail: `${parsed.todos?.length ?? 0} todos` }
    case "WebFetch":
      return { title: desc || "WebFetch", detail: truncateArgs(String(parsed.url ?? "")) }
    case "WebSearch":
      return { title: desc || "WebSearch", detail: truncateArgs(String(parsed.query ?? "")) }
    default: {
      const firstKey = parsed && typeof parsed === "object" ? Object.keys(parsed)[0] : undefined
      const detail = firstKey ? String(parsed[firstKey] ?? "") : ""
      return { title: desc || tool, detail: truncateArgs(detail) }
    }
  }
}

export function extractTeamAgents(messages: Message[], isStreaming?: boolean): TeamAgent[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant" || !msg.toolCalls) continue
    const agentCalls = msg.toolCalls.filter((tc: ToolCall) => tc.tool === "Agent")
    if (agentCalls.length === 0) continue

    return agentCalls.map((tc: ToolCall) => {
      let description = "Agent"
      if (tc.args) {
        try {
          const parsed = JSON.parse(tc.args)
          description = parsed.description || parsed.prompt?.slice(0, 40) || "Agent"
        } catch {
          description = tc.args.length > 40 ? tc.args.slice(0, 40) + "…" : tc.args
        }
      }
      return {
        id: tc.id,
        description,
        status: (!isStreaming || tc.result != null) ? "done" as const : "running" as const,
        subCalls: tc.subCalls,
        outputText: tc.outputText,
        result: tc.result,
      }
    })
  }
  return []
}

// Random "bee" name generator for new-agent creation.
const BEE_ADJECTIVES = [
  "golden", "amber", "clover", "lavender", "sage", "thyme", "meadow",
  "misty", "swift", "bright", "busy", "wild", "pollen", "honey", "wax",
  "violet", "royal", "fuzzy", "striped", "sunlit", "drowsy", "hazy",
  "nimble", "plucky", "eager", "dusky", "velvet", "copper", "crimson",
  "ivory", "marbled", "silken", "frosted", "glossy", "humming", "dappled",
  "quiet", "restless", "brisk", "gentle", "wistful", "weary", "jolly",
  "quirky", "zesty", "tangy", "sugary", "minty", "buttery", "dusty",
  "earthen", "rustic", "woodland", "linen", "willow", "cedar", "juniper",
  "hazel", "birch", "rowan", "maple", "ember", "mossy", "fernlike",
  "breezy", "sunny", "stormy", "cloudy", "starlit", "moonlit", "dawnlit",
]
const BEE_NOUNS = [
  "scout", "forager", "guard", "worker", "drone", "nurse", "harvester",
  "wanderer", "pilgrim", "ranger", "keeper", "seeker", "drifter", "carrier",
  "gatherer", "builder", "mender", "tender", "weaver", "dancer", "singer",
  "climber", "flier", "rover", "hunter", "tracker", "watcher", "herald",
  "courier", "runner", "sifter", "sorter", "tinker", "cobbler", "scribe",
  "sage", "mystic", "dreamer", "poet", "jester", "acrobat", "trickster",
  "nomad", "voyager", "sailor", "captain", "mariner", "pathfinder", "shepherd",
  "gardener", "baker", "brewer", "smith", "potter", "carver", "painter",
]

export function randomBeeName(): string {
  const adj = BEE_ADJECTIVES[Math.floor(Math.random() * BEE_ADJECTIVES.length)]
  const noun = BEE_NOUNS[Math.floor(Math.random() * BEE_NOUNS.length)]
  // 5-char base36 suffix adds ~60M possibilities per (adj, noun) pair,
  // making collisions astronomically unlikely and preventing stale-branch
  // name reuse from false-positive "already merged" detection.
  const suffix = Math.random().toString(36).slice(2, 7).padStart(5, "0")
  return `${adj}-${noun}-${suffix}`
}

export function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
