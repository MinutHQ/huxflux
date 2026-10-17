import type { RefObject } from "react"
import { IconSearch, IconX } from "@tabler/icons-react"
import type { Agent } from "@huxflux/shared"
import type { useDirectoryTree } from "../../hooks/useDirectoryTree"
import { DirectoryTree } from "./DirectoryTree"
import { FilterResults } from "./FilterResults"
import { useDownloadFile } from "../../hooks/useDownloadFile"

interface FilesSidebarProps {
  agent: Agent
  filter: string
  onFilterChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  tree: ReturnType<typeof useDirectoryTree>
  activePath: string | null
  onOpen: (path: string, opts?: { pin?: boolean; line?: number }) => void
  onFirstResult: (first: { path: string; line?: number } | null) => void
  onEnter: () => void
}

/** Left column of the Files section: the filter box over either the tree or the filter results. */
export function FilesSidebar({ agent, filter, onFilterChange, inputRef, tree, activePath, onOpen, onFirstResult, onEnter }: FilesSidebarProps) {
  const download = useDownloadFile(agent.id)
  return (
    <div className="flex flex-col h-full border-r border-border/60">
      <div className="relative mx-1.5 mt-1.5 mb-1">
        <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onFilterChange("")
            if (e.key === "Enter") onEnter()
          }}
          placeholder="Filter, or ? to search in files"
          className="w-full h-7 pl-6 pr-6 rounded-md bg-background border border-border/60 text-[12px] outline-none focus:border-ring placeholder:text-muted-foreground/70"
        />
        {filter && (
          <button onClick={() => onFilterChange("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <IconX size={12} />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {filter ? (
          <FilterResults
            agentId={agent.id}
            filter={filter}
            onOpen={(path, line) => onOpen(path, { pin: !!line, line })}
            onFirstResult={onFirstResult}
          />
        ) : (
          <DirectoryTree tree={tree} activePath={activePath} fileChanges={agent.fileChanges} onOpen={(path, pin) => onOpen(path, { pin })} onDownload={download} />
        )}
      </div>
    </div>
  )
}
