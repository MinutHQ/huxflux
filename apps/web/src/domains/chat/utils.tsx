import {
  IconTerminal2,
  IconFileText,
  IconPencil,
  IconSearch,
  IconSparkles,
  IconKey,
} from "@tabler/icons-react"
import { getActiveServer } from "@huxflux/shared"

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

// Returns a human-friendly { title, detail } for a tool call.
// `title` is the prominent label (the tool's description if provided, else
// something derived from the args). `detail` is the monospace summary next to it.
export function formatToolCall(tool: string, args?: string): { title: string; detail: string } {
  if (!args) return { title: tool, detail: "" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any
  try {
    parsed = JSON.parse(args)
  } catch {
    return { title: tool, detail: truncateArgs(args) }
  }

  // If the tool input includes a description (e.g. Bash sometimes does), prefer
  // it as the title regardless of which tool it is.
  const desc = getDesc(parsed)

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
    .replace(/<huxflux:title>.*?<\/huxflux:title>\n?/gs, "")
    .replace(/<huxflux:branch>.*?<\/huxflux:branch>\n?/gs, "")
    .replace(/<huxflux:delegate[^>]*>[\s\S]*?<\/huxflux:delegate>\n?/g, "")
    .replace(/<huxflux:task-comment[^>]*>[\s\S]*?<\/huxflux:task-comment>\n?/g, "")
    .replace(/<huxflux:task-update[^>]*>[\s\S]*?<\/huxflux:task-update>\n?/g, "")
    .replace(/<huxflux:task-create[^>]*>[\s\S]*?<\/huxflux:task-create>\n?/g, "")
    .replace(/<huxflux:task-status[^>]*\/>\n?/g, "")
    .replace(/<huxflux:task-dependency[^>]*\/>\n?/g, "")
    .replace(/<huxflux:spawn[^>]*>[\s\S]*?<\/huxflux:spawn>\n?/g, "")
    .replace(/<huxflux:pr-reply[^>]*>[\s\S]*?<\/huxflux:pr-reply>\n?/g, "")
}
