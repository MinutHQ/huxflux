import React, { useEffect, useRef, useState } from "react"
import { IconFilter, IconFolderPlus, IconPlus, IconSparkles } from "@tabler/icons-react"
import { Button } from "@huxflux/ui"
import { useNavigate, useMatchRoute } from "@tanstack/react-router"
import { useRepos, type AgentSummary, type AgentStatus } from "@huxflux/shared"
import { AddRepoDialog } from "@/domains/settings/AddRepoDialog"
import { CloneRepoDialog } from "@/domains/settings/CloneRepoDialog"
import { QuickStartDialog } from "@/domains/settings/QuickStartDialog"
import { visibleStatuses } from "../agentListUtils"
import { useAgentGroups } from "../hooks/useAgentGroups"
import { useAgentLifecycle } from "../hooks/useAgentLifecycle"
import { AgentPopover } from "./agent-list/AgentPopover"
import { AddWorkspacePopover } from "./agent-list/AddWorkspacePopover"
import { FilterPopover } from "./agent-list/FilterPopover"
import { NewAgentPopover } from "./agent-list/NewAgentPopover"
import { PendingAgentRow } from "./agent-list/PendingAgentRow"
import { PinnedGroup } from "./agent-list/PinnedGroup"
import { RepoGroup } from "./agent-list/RepoGroup"
import { StatusGroup } from "./agent-list/StatusGroup"
import type { GroupByMode } from "../agents.types"

interface AgentListProps {
  agents: AgentSummary[]
  /** Container the popover anchors to; used to compute the popover's left offset. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * The full "Agents" pane: workspace header row (filter / add-workspace / +),
 * status- or repo-grouped agent list, hover popover, the new-agent and
 * add-workspace flows, and the empty state. Owns its own UI state (filter
 * popover visibility, hovered agent, dialogs) but routes navigation and
 * lifecycle through hooks so the shell stays decoupled.
 *
 * groupBy and repoFilter are persisted in localStorage so the user's choice
 * survives a reload. Both keys are intentionally namespaced under `hive:`
 * (legacy from before the `huxflux:` rename — kept verbatim so users don't
 * lose their settings).
 */
export function AgentList({ agents, containerRef }: AgentListProps) {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const { data: repos = [] } = useRepos()

  const [hoveredAgent, setHoveredAgent] = useState<{ agent: AgentSummary; y: number } | null>(null)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [showAddWorkspace, setShowAddWorkspace] = useState(false)
  const [showAddRepo, setShowAddRepo] = useState(false)
  const [showAddFolder, setShowAddFolder] = useState(false)
  const [showCloneRepo, setShowCloneRepo] = useState(false)
  const [showQuickStart, setShowQuickStart] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [groupBy, setGroupByRaw] = useState<GroupByMode>(() => (localStorage.getItem("hive:sidebar:groupBy") as GroupByMode) || "status")
  const setGroupBy = (v: GroupByMode) => { setGroupByRaw(v); localStorage.setItem("hive:sidebar:groupBy", v) }
  const [repoFilter, setRepoFilterRaw] = useState(() => localStorage.getItem("hive:sidebar:repoFilter") || "all")
  const setRepoFilter = (v: string) => { setRepoFilterRaw(v); localStorage.setItem("hive:sidebar:repoFilter", v) }

  const addWorkspaceBtnRef = useRef<HTMLButtonElement>(null)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const newAgentBtnRef = useRef<HTMLButtonElement>(null)

  // Derive selected agent from the current route
  const agentMatch = matchRoute({ to: "/agent/$agentId", fuzzy: false }) as { agentId: string } | false
  const selectedId = agentMatch ? agentMatch.agentId : ""

  const groups = useAgentGroups({ agents, repoFilter })
  const { filteredAgents, threadChildrenByParent, pinnedAgents, grouped, repoGrouped, repoNames, repoIcons, repoTypes, agentPorts } = groups
  const { handleCreateAgent, handleDeleteAgent, handleArchiveAll, pendingAgent } = useAgentLifecycle({
    grouped,
    repos: groups.repos,
  })

  // ⌘N from a global key listener fires the `huxflux:new-agent` window event.
  useEffect(() => {
    function onNewAgent() { setShowNewAgent(true) }
    window.addEventListener("huxflux:new-agent", onNewAgent)
    return () => window.removeEventListener("huxflux:new-agent", onNewAgent)
  }, [])

  const onSelect = (id: string) => navigate({ to: "/agent/$agentId", params: { agentId: id } })

  return (
    <>
      {/* Agents header */}
      <div className="px-4 py-2.5 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Workspaces</span>
          <div className="flex items-center gap-1">
            <Button ref={filterBtnRef} variant="ghost" size="icon-xs" onClick={() => setShowFilter(!showFilter)}>
              <IconFilter size={13} />
            </Button>
            <Button ref={addWorkspaceBtnRef} variant="ghost" size="icon-xs" onClick={() => setShowAddWorkspace(true)}>
              <IconFolderPlus size={13} />
            </Button>
            <Button ref={newAgentBtnRef} variant="ghost" size="icon-xs" onClick={() => setShowNewAgent(true)}>
              <IconPlus size={13} />
            </Button>
          </div>
        </div>
      </div>

      {/* Agent list */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-2 pt-2.5 space-y-0.5">
          <AgentListBody
            filteredAgents={filteredAgents}
            pinnedAgents={pinnedAgents}
            grouped={grouped}
            repoGrouped={repoGrouped}
            groupBy={groupBy}
            pendingAgent={pendingAgent}
            selectedId={selectedId}
            onSelect={onSelect}
            onHover={(agent, y) => setHoveredAgent({ agent, y })}
            onLeave={() => setHoveredAgent(null)}
            onDelete={handleDeleteAgent}
            onArchiveAll={handleArchiveAll}
            onOpenNewAgent={() => setShowNewAgent(true)}
            agentPorts={agentPorts}
            repoNames={repoNames}
            repoIcons={repoIcons}
            repoTypes={repoTypes}
            threadChildrenByParent={threadChildrenByParent}
          />
        </div>
      </div>

      {hoveredAgent && (
        <AgentPopover
          agent={hoveredAgent.agent}
          y={hoveredAgent.y}
          port={agentPorts[hoveredAgent.agent.id]}
          containerRef={containerRef}
        />
      )}

      {showNewAgent && (
        <NewAgentPopover
          onClose={() => setShowNewAgent(false)}
          onSelect={(repoId, title, branch, direct) => {
            setShowNewAgent(false)
            void handleCreateAgent(repoId, title, branch, direct)
          }}
          anchorRef={newAgentBtnRef}
        />
      )}
      {showAddWorkspace && (
        <AddWorkspacePopover
          onClose={() => setShowAddWorkspace(false)}
          onOpenProject={() => setShowAddRepo(true)}
          onAddFolder={() => setShowAddFolder(true)}
          onClone={() => setShowCloneRepo(true)}
          onQuickStart={() => setShowQuickStart(true)}
          anchorRef={addWorkspaceBtnRef}
        />
      )}
      {showAddRepo && <AddRepoDialog onClose={() => setShowAddRepo(false)} onAdded={() => setShowAddRepo(false)} />}
      {showAddFolder && <AddRepoDialog initialType="folder" onClose={() => setShowAddFolder(false)} onAdded={() => setShowAddFolder(false)} />}
      {showCloneRepo && <CloneRepoDialog onClose={() => setShowCloneRepo(false)} onAdded={() => setShowCloneRepo(false)} />}
      {showQuickStart && <QuickStartDialog onClose={() => setShowQuickStart(false)} onAdded={() => setShowQuickStart(false)} />}
      {showFilter && (
        <FilterPopover
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          repoFilter={repoFilter}
          onRepoFilterChange={setRepoFilter}
          repos={repos}
          onClose={() => setShowFilter(false)}
          anchorRef={filterBtnRef}
        />
      )}
    </>
  )
}

interface AgentListBodyProps {
  filteredAgents: AgentSummary[]
  pinnedAgents: AgentSummary[]
  grouped: Record<AgentStatus, AgentSummary[]>
  repoGrouped: { id: string; name: string; agents: AgentSummary[] }[]
  groupBy: GroupByMode
  pendingAgent: { title: string; repoName: string } | null
  selectedId: string
  onSelect: (id: string) => void
  onHover: (agent: AgentSummary, y: number) => void
  onLeave: () => void
  onDelete: (agent: AgentSummary) => void
  onArchiveAll: (status: AgentStatus) => void
  onOpenNewAgent: () => void
  agentPorts: Record<string, number | null>
  repoNames: Record<string, string>
  repoIcons: Record<string, string | undefined>
  repoTypes: Record<string, string | undefined>
  threadChildrenByParent: Map<string, AgentSummary[]>
}

function AgentListBody({
  filteredAgents,
  pinnedAgents,
  grouped,
  repoGrouped,
  groupBy,
  pendingAgent,
  selectedId,
  onSelect,
  onHover,
  onLeave,
  onDelete,
  onArchiveAll,
  onOpenNewAgent,
  agentPorts,
  repoNames,
  repoIcons,
  repoTypes,
  threadChildrenByParent,
}: AgentListBodyProps) {
  if (filteredAgents.length === 0 && !pendingAgent) {
    return (
      <button
        onClick={onOpenNewAgent}
        className="w-full flex flex-col items-center gap-2 py-8 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        <IconSparkles size={20} />
        <span className="text-[12px]">Create your first agent</span>
      </button>
    )
  }

  if (groupBy === "status") {
    return (
      <>
        <PinnedGroup
          agents={pinnedAgents}
          selectedId={selectedId}
          onSelect={onSelect}
          onHover={onHover}
          onLeave={onLeave}
          onDelete={onDelete}
          agentPorts={agentPorts}
          repoNames={repoNames}
          repoIcons={repoIcons}
          repoTypes={repoTypes}
          threadChildrenByParent={threadChildrenByParent}
        />
        {visibleStatuses.map((status) => (
          <div key={status}>
            {status === "in-progress" && pendingAgent && (
              <PendingAgentRow title={pendingAgent.title} repoName={pendingAgent.repoName} />
            )}
            <StatusGroup
              status={status}
              agents={grouped[status]}
              selectedId={selectedId}
              onSelect={onSelect}
              onHover={onHover}
              onLeave={onLeave}
              onDelete={onDelete}
              onArchiveAll={(status === "done" || status === "cancelled") ? () => onArchiveAll(status) : undefined}
              agentPorts={agentPorts}
              repoNames={repoNames}
              repoIcons={repoIcons}
              repoTypes={repoTypes}
              threadChildrenByParent={threadChildrenByParent}
            />
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      <PinnedGroup
        agents={pinnedAgents}
        selectedId={selectedId}
        onSelect={onSelect}
        onHover={onHover}
        onLeave={onLeave}
        onDelete={onDelete}
        agentPorts={agentPorts}
        repoNames={repoNames}
        repoIcons={repoIcons}
        repoTypes={repoTypes}
        threadChildrenByParent={threadChildrenByParent}
      />
      {repoGrouped.map((group) => (
        <RepoGroup
          key={group.id}
          repoName={group.name}
          repoType={repoTypes[group.id]}
          agents={group.agents}
          selectedId={selectedId}
          onSelect={onSelect}
          onHover={onHover}
          onLeave={onLeave}
          onDelete={onDelete}
          agentPorts={agentPorts}
        />
      ))}
    </>
  )
}
