import { useState, type ReactNode } from "react"
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@huxflux/ui"
import {
  IconArrowsMaximize, IconArrowsMinimize, IconChevronDown, IconChevronRight, IconLayoutColumns,
  IconLayoutRows, IconLayoutSidebar, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand,
  IconRefresh, IconSearch, IconCheck,
} from "@tabler/icons-react"
import type { DiffBase } from "@huxflux/shared"
import { PaneMenu } from "../PaneMenu"

interface DiffPaneHeaderProps {
  baseBranch: string
  branch: string
  base: DiffBase
  onBaseChange: (base: DiffBase) => void
  treeVisible: boolean
  onToggleTree: () => void
  diffVisible: boolean
  onToggleDiff: () => void
  searchOpen: boolean
  onToggleSearch: () => void
  diffStyle: "unified" | "split"
  onDiffStyleChange: (style: "unified" | "split") => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onRefresh: () => void
  controls?: ReactNode
}

const baseOptions: Array<{ value: DiffBase; label: string; hint: string }> = [
  { value: "branch", label: "All branch changes", hint: "Committed and uncommitted, vs the base branch" },
  { value: "uncommitted", label: "Uncommitted changes", hint: "Working tree vs the last commit" },
]

/** Diff pane header: tree toggle, `base › branch` crumb with base picker, search, menu, window controls. */
export function DiffPaneHeader(props: DiffPaneHeaderProps) {
  const [baseOpen, setBaseOpen] = useState(false)
  const { base, baseBranch, branch } = props

  return (
    <div className="flex items-center gap-1 h-9 px-1.5 border-b border-border/60 shrink-0">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={props.onToggleTree}
        title={props.treeVisible ? "Hide file tree" : "Show file tree"}
        className={cn(!props.treeVisible && "text-muted-foreground")}
      >
        <IconLayoutSidebar size={14} />
      </Button>

      <Popover open={baseOpen} onOpenChange={setBaseOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1 min-w-0 px-1.5 h-6 rounded-md text-[12px] hover:bg-accent/60 transition-colors">
            <span className="text-muted-foreground truncate">{base === "branch" ? baseBranch : "HEAD"}</span>
            <IconChevronRight size={11} className="text-muted-foreground/60 shrink-0" />
            <span className="text-foreground truncate">{branch}</span>
            <IconChevronDown size={11} className="text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-64 p-1">
          {baseOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => { setBaseOpen(false); props.onBaseChange(o.value) }}
              className="w-full flex items-start gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-accent transition-colors"
            >
              <span className="w-3.5 pt-0.5 text-muted-foreground">{base === o.value && <IconCheck size={12} />}</span>
              <span className="flex flex-col">
                <span className="text-[12px] text-foreground">{o.label}</span>
                <span className="text-[11px] text-muted-foreground">{o.hint}</span>
              </span>
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={props.onToggleDiff}
          title={props.diffVisible ? "Close diff (keep the file tree)" : "Show diff"}
          className={cn(!props.diffVisible && "text-muted-foreground")}
        >
          {props.diffVisible ? <IconLayoutSidebarRightCollapse size={14} /> : <IconLayoutSidebarRightExpand size={14} />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={props.onToggleSearch}
          title="Filter files"
          className={cn(props.searchOpen && "bg-accent")}
        >
          <IconSearch size={14} />
        </Button>
        <PaneMenu
          items={[
            { label: "Unified view", icon: <IconLayoutRows size={13} />, checked: props.diffStyle === "unified", onSelect: () => props.onDiffStyleChange("unified") },
            { label: "Split view", icon: <IconLayoutColumns size={13} />, checked: props.diffStyle === "split", onSelect: () => props.onDiffStyleChange("split") },
            "separator",
            { label: "Expand all files", icon: <IconArrowsMaximize size={13} />, onSelect: props.onExpandAll },
            { label: "Collapse all files", icon: <IconArrowsMinimize size={13} />, onSelect: props.onCollapseAll },
            "separator",
            { label: "Refresh", icon: <IconRefresh size={13} />, onSelect: props.onRefresh },
          ]}
        />
        {props.controls}
      </div>
    </div>
  )
}
