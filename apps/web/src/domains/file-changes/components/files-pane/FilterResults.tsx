import { useEffect, useMemo, useState } from "react"
import { cn } from "@huxflux/ui"
import { IconFile } from "@tabler/icons-react"
import {
  api, fuzzyFilterPaths, groupSearchMatches, queryKeys, useHuxfluxQuery, type PathMatch,
} from "@huxflux/shared"
import { fileColor } from "../../utils"

interface FilterResultsProps {
  agentId: string
  /** Raw filter input. A leading `?` switches to content search. */
  filter: string
  onOpen: (path: string, line?: number) => void
  /** Receives the first result so Enter in the input can open it. */
  onFirstResult: (first: { path: string; line?: number } | null) => void
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function Highlighted({ match }: { match: PathMatch }) {
  const hits = new Set(match.indices)
  const nameStart = match.path.lastIndexOf("/") + 1
  const render = (from: number, to: number) =>
    [...match.path.slice(from, to)].map((ch, i) => (
      <span key={from + i} className={cn(hits.has(from + i) && "text-foreground font-semibold")}>{ch}</span>
    ))
  return (
    <span className="truncate">
      <span className="text-foreground/90">{render(nameStart, match.path.length)}</span>
      {nameStart > 0 && <span className="ml-1.5 text-muted-foreground text-[11px]">{render(0, nameStart - 1)}</span>}
    </span>
  )
}

/** Name-filter matches or `?` content-search hits, replacing the tree while the filter is set. */
export function FilterResults({ agentId, filter, onOpen, onFirstResult }: FilterResultsProps) {
  const isContent = filter.startsWith("?")
  const query = useDebounced(isContent ? filter.slice(1).trim() : filter.trim(), isContent ? 250 : 60)

  const { data: paths = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.filePaths(agentId),
    queryFn: () => api.agents.filePaths(agentId),
    staleTime: 30_000,
    enabled: !isContent,
  })
  const { data: hits = [], isFetching } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileSearch(agentId, query),
    queryFn: () => api.agents.searchFiles(agentId, query),
    enabled: isContent && query.length > 0,
    staleTime: 10_000,
  })

  const nameMatches = useMemo(() => (isContent ? [] : fuzzyFilterPaths(paths, query, 200)), [isContent, paths, query])
  const groups = useMemo(() => (isContent ? groupSearchMatches(hits) : []), [isContent, hits])

  const first = isContent
    ? (groups[0]?.matches[0] ? { path: groups[0].path, line: groups[0].matches[0].line } : null)
    : (nameMatches[0] ? { path: nameMatches[0].path } : null)
  const firstKey = first ? `${first.path}:${first.line ?? ""}` : ""
  useEffect(() => { onFirstResult(first) },
  // `first` is rebuilt every render; firstKey is its identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [firstKey, onFirstResult])

  if (isContent) {
    if (!query) return <Hint text="Type to search file contents" />
    if (groups.length === 0) return <Hint text={isFetching ? "Searching..." : "No matches"} />
    return (
      <div className="h-full overflow-y-auto py-1 text-[12px]">
        {groups.map((g) => (
          <div key={g.path} className="mb-1">
            <button onClick={() => onOpen(g.path)} className="w-full flex items-center gap-1.5 h-6 px-2 hover:bg-accent/50 text-left">
              <IconFile size={12} className={cn("shrink-0", fileColor(g.path.split("/").pop() ?? ""))} />
              <span className="truncate text-foreground">{g.path}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{g.matches.length}</span>
            </button>
            {g.matches.map((m) => (
              <button
                key={`${m.path}:${m.line}`}
                onClick={() => onOpen(m.path, m.line)}
                className="w-full flex items-baseline gap-2 pl-7 pr-2 py-0.5 hover:bg-accent/50 text-left"
              >
                <span className="shrink-0 w-7 text-right font-mono text-[10px] text-muted-foreground">{m.line}</span>
                <span className="truncate font-mono text-[11px] text-foreground/80">{m.preview}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (nameMatches.length === 0) return <Hint text="No matching files" />
  return (
    <div className="h-full overflow-y-auto py-1 text-[12px]">
      {nameMatches.map((m) => (
        <button key={m.path} onClick={() => onOpen(m.path)} className="w-full flex items-center gap-1.5 h-6 px-2 hover:bg-accent/50 text-left text-muted-foreground">
          <IconFile size={12} className={cn("shrink-0", fileColor(m.path.split("/").pop() ?? ""))} />
          <Highlighted match={m} />
        </button>
      ))}
    </div>
  )
}

function Hint({ text }: { text: string }) {
  return <p className="px-3 py-3 text-[12px] text-muted-foreground">{text}</p>
}
