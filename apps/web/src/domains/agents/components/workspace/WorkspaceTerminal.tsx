import { useNavigate } from "@tanstack/react-router"
import type { Agent } from "@huxflux/shared"
import { TerminalView } from "../TerminalView"
import type { TerminalTopTab } from "../../agents.types"

interface WorkspaceTerminalProps {
  agent: Agent
  activeTab: TerminalTopTab
  onTabChange: (tab: TerminalTopTab) => void
}

/** The terminal pane of the agent workspace. */
export function WorkspaceTerminal({ agent, activeTab, onTabChange }: WorkspaceTerminalProps) {
  const navigate = useNavigate()
  return (
    <div className="relative h-full">
      <TerminalView
        key={agent.id}
        agent={agent}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onOpenSettings={() => navigate({ to: "/settings" })}
        onPortChange={() => {}}
      />
    </div>
  )
}
