import {
  IconTerminal2,
  IconFileText,
  IconPencil,
  IconSearch,
  IconSparkles,
  IconKey,
} from "@tabler/icons-react"
import { getActiveServer, type ToolCall } from "@huxflux/shared"

export function isRemoteServer(): boolean {
  const server = getActiveServer()
  if (!server) return false
  try {
    const h = new URL(server.url).hostname
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1"
  } catch { return false }
}

export function toolIcon(tool: string) {
  if (tool === "Bash") return <IconTerminal2 size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Read" || tool === "Write") return <IconFileText size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Edit") return <IconPencil size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Glob" || tool === "Grep") return <IconSearch size={12} className="text-muted-foreground/60 shrink-0" />
  if (tool === "Agent") return <IconSparkles size={12} className="text-muted-foreground/60 shrink-0" />
  return <IconKey size={12} className="text-muted-foreground/60 shrink-0" />
}

export function truncateArgs(args: string, max = 52) {
  return args.length > max ? args.slice(0, max) + "…" : args
}

export function basename(p: string): string {
  if (!p) return ""
  const parts = p.split("/")
  return parts[parts.length - 1] || p
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDesc(parsed: any): string {
  return typeof parsed?.description === "string" ? parsed.description.trim() : ""
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatBash(parsed: any, desc: string): { title: string; detail: string } {
  const cmd = String(parsed.command ?? "").trim()
  if (desc) return { title: desc, detail: truncateArgs(cmd) }
  // Fall back to using the command's first token as the title.
  const m = cmd.match(/^(\S+)\s*([\s\S]*)$/)
  if (!m) return { title: "Bash", detail: "" }
  return { title: m[1], detail: truncateArgs(m[2]) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatGrep(parsed: any, desc: string): { title: string; detail: string } {
  const pat = String(parsed.pattern ?? "")
  const where = parsed.path
    ? ` in ${basename(String(parsed.path))}`
    : parsed.glob ? ` in ${parsed.glob}` : ""
  return { title: desc || "grep", detail: truncateArgs(`for "${pat}"${where}`) }
}

export interface FormattedToolCall {
  /** Prominent label: the tool's description if provided, else derived from the args. */
  title: string
  /** Monospace summary next to the title (command, path, pattern). */
  detail: string
  /** True when `title` is the model's own description of the call. */
  hasDescription: boolean
}

// Returns a human-friendly { title, detail } for a tool call.
export function formatToolCall(tool: string, args?: string): FormattedToolCall {
  if (!args) return { title: tool, detail: "", hasDescription: false }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any
  try {
    parsed = JSON.parse(args)
  } catch {
    return { title: tool, detail: truncateArgs(args), hasDescription: false }
  }

  // If the tool input includes a description (e.g. Bash sometimes does), prefer
  // it as the title regardless of which tool it is.
  const desc = getDesc(parsed)
  return { ...formatByTool(tool, parsed, desc), hasDescription: desc.length > 0 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatByTool(tool: string, parsed: any, desc: string): { title: string; detail: string } {
  switch (tool) {
    case "Bash": return formatBash(parsed, desc)
    case "Grep": return formatGrep(parsed, desc)
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
    case "AskUserQuestion": {
      const q = parsed.questions?.[0]?.question ?? ""
      return { title: desc || "Asking a question", detail: truncateArgs(q) }
    }
    default: {
      const firstKey = parsed && typeof parsed === "object" ? Object.keys(parsed)[0] : undefined
      const val = firstKey ? parsed[firstKey] : undefined
      const detail = typeof val === "string" ? val : typeof val === "number" ? String(val) : ""
      return { title: desc || tool, detail: truncateArgs(detail) }
    }
  }
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** Strip huxflux XML tags from displayed content */
export function stripHuxfluxTags(text: string): string {
  return text
    .replace(/<huxflux:[^>]*?\/>[\t ]*\n?/g, "")
    .replace(/<huxflux:([^\s>]+)\b[^>]*?>[\s\S]*?<\/huxflux:\1>[\t ]*\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
}

/** Flatten markdown to plain prose for a one-glance preview (collapsed
 *  accordion). Drops fences, inline code markers, emphasis, headings and
 *  list bullets; keeps the words. */
export function markdownToPlainText(text: string): string {
  return stripHuxfluxTags(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    // Emphasis only where CommonMark would see it: marker at a word edge and
    // hugging non-space content. Leaves snake_case and `5 * 3` alone.
    .replace(/(^|\s)(\*\*|__)(\S(?:.*?\S)?)\2(?=\s|$|[.,;:!?)])/g, "$1$3")
    .replace(/(^|\s)([*_])(\S(?:[^*_]*?\S)?)\2(?=\s|$|[.,;:!?)])/g, "$1$3")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

/** A tool call is in flight only while its message is still streaming AND
 *  no result has landed. Without the streaming guard, a call that never got a
 *  result (legacy rows) would look live forever. */
export function isToolCallRunning(call: ToolCall, isStreaming: boolean | undefined): boolean {
  return !!isStreaming && !call.result
}

/** The per-agent Headroom flag arrives as 0/1 from the DB, or a boolean from an optimistic cache patch. */
export function isHeadroomOn(agent: { headroom?: number | boolean | null }): boolean {
  return agent.headroom === 1 || agent.headroom === true
}
