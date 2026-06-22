import { useCallback, useMemo, useRef, useState, useEffect } from "react"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"

export type MentionAttachment = { type: "file"; path: string; name: string } | { type: "terminal" }

export type MentionOption = { type: "file" | "terminal"; name: string; path: string }

interface FileTreeNode {
  type: string
  name: string
  path: string
  children?: FileTreeNode[]
}

function flattenTree(nodes: FileTreeNode[]): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = []
  for (const node of nodes) {
    if (node.type === "file") result.push({ name: node.name, path: node.path })
    if (node.children) result.push(...flattenTree(node.children))
  }
  return result
}

interface UseMentionsAndSlashArgs {
  agentId: string
  setInput: (updater: (prev: string) => string) => void
}

function useMentionDataQueries(agentId: string, slashQuery: string | null, mentionQuery: string | null) {
  const { data: filteredCommands = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.slashCommands(agentId, slashQuery),
    queryFn: () => api.agents.slashCommands(agentId, slashQuery ?? undefined),
    enabled: slashQuery !== null,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
  const { data: fileTree = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileTree(agentId),
    queryFn: () => api.agents.fileTree(agentId),
    enabled: mentionQuery !== null,
    staleTime: 30_000,
  })
  return { filteredCommands, fileTree }
}

// Levenshtein substring distance: minimum edits to match query against any
// substring of target. First DP row is zeroed so matching can start anywhere.
function fuzzyDistance(query: string, target: string): number {
  const m = query.length
  const n = target.length
  if (m === 0) return 0
  if (n === 0) return m
  let prev = new Array<number>(n + 1).fill(0)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      if (query[i - 1] === target[j - 1]) {
        curr[j] = prev[j - 1]
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
      }
    }
    ;[prev, curr] = [curr, new Array<number>(n + 1)]
  }
  let best = prev[1]
  for (let j = 2; j <= n; j++) {
    if (prev[j] < best) best = prev[j]
  }
  return best
}

function makeMentionOptions(fileTree: FileTreeNode[], mentionQuery: string | null): MentionOption[] {
  const q = mentionQuery ?? ""
  const files = flattenTree(fileTree)
  if (q === "") return [
    { type: "terminal" as const, name: "Terminal output", path: "" },
    ...files.slice(0, 20).map((f) => ({ type: "file" as const, name: f.name, path: f.path })),
  ]
  const ql = q.toLowerCase()
  const useExact = ql.length <= 2
  const maxDist = useExact ? 0 : Math.ceil(ql.length * 0.4)
  const scored: { file: typeof files[0]; dist: number }[] = []
  for (const f of files) {
    const dist = fuzzyDistance(ql, f.path.toLowerCase())
    if (dist <= maxDist) scored.push({ file: f, dist })
  }
  scored.sort((a, b) => a.dist - b.dist || a.file.name.length - b.file.name.length)
  const filtered = scored.slice(0, 20).map((r) => r.file)
  return [
    { type: "terminal" as const, name: "Terminal output", path: "" },
    ...filtered.map((f) => ({ type: "file" as const, name: f.name, path: f.path })),
  ]
}

export function useMentionsAndSlash({ agentId, setInput }: UseMentionsAndSlashArgs) {
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionAttachments, setMentionAttachments] = useState<MentionAttachment[]>([])
  const mentionStartRef = useRef<number>(0)
  const mentionListRef = useRef<HTMLDivElement>(null)
  const mentionActiveRef = useRef<HTMLDivElement>(null)

  // Scroll active mention row into view when navigating with keyboard
  useEffect(() => {
    mentionActiveRef.current?.scrollIntoView({ block: "nearest" })
  }, [mentionIndex])

  const { filteredCommands, fileTree } = useMentionDataQueries(agentId, slashQuery, mentionQuery)
  const mentionOptions = useMemo<MentionOption[]>(
    () => makeMentionOptions(fileTree as FileTreeNode[], mentionQuery),
    [fileTree, mentionQuery],
  )

  function detectInputTriggers(value: string) {
    const lastLine = value.split("\n").pop() ?? ""
    if (lastLine.startsWith("/")) {
      setSlashQuery(lastLine.slice(1))
      setSlashIndex(0)
    } else {
      setSlashQuery(null)
    }
    const atMatch = lastLine.match(/(^|[\s])@(\S*)$/)
    if (atMatch) {
      const query = atMatch[2]
      mentionStartRef.current = value.lastIndexOf("@" + query)
      setMentionQuery(query)
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  const applySlashCommand = useCallback((name: string) => {
    setInput((prev) => {
      const lines = prev.split("\n")
      lines[lines.length - 1] = `/${name} `
      return lines.join("\n")
    })
    setSlashQuery(null)
  }, [setInput])

  const applyMention = useCallback((option: MentionOption) => {
    const queryLen = mentionQuery?.length ?? 0
    if (option.type === "file") {
      const displayName = option.name.split("/").pop() ?? option.name
      setInput((prev) => {
        const start = mentionStartRef.current
        return prev.slice(0, start) + "@" + displayName + " " + prev.slice(start + 1 + queryLen)
      })
      setMentionAttachments((prev) => prev.some((x) => x.type === "file" && x.path === option.path)
        ? prev
        : [...prev, { type: "file" as const, path: option.path, name: displayName }])
    } else {
      setInput((prev) => {
        const start = mentionStartRef.current
        return prev.slice(0, start) + prev.slice(start + 1 + queryLen)
      })
      setMentionAttachments((prev) => prev.some((x) => x.type === "terminal")
        ? prev
        : [...prev, { type: "terminal" as const }])
    }
    setMentionQuery(null)
  }, [mentionQuery, setInput])

  return {
    slashQuery, setSlashQuery,
    slashIndex, setSlashIndex,
    mentionQuery, setMentionQuery,
    mentionIndex, setMentionIndex,
    mentionAttachments, setMentionAttachments,
    mentionListRef, mentionActiveRef,
    filteredCommands, mentionOptions,
    detectInputTriggers,
    applySlashCommand,
    applyMention,
  }
}
