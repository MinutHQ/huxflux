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

function makeMentionOptions(fileTree: FileTreeNode[], mentionQuery: string | null): MentionOption[] {
  const q = mentionQuery ?? ""
  const files = flattenTree(fileTree)
  const filtered = q === ""
    ? files.slice(0, 20)
    : files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
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
