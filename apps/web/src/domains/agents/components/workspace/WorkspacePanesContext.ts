import { createContext, useContext, type ReactNode } from "react"
import type { WorkspacePaneId } from "../../agents.types"
import type { AgentWorkspaceLayout } from "../../hooks/useAgentWorkspaceLayout"

export interface WorkspacePanes {
  content: Record<WorkspacePaneId, ReactNode>
  ui: AgentWorkspaceLayout
}

/**
 * Hands the live pane contents and layout actions to dockview's panel, tab and
 * header renderers, which dockview mounts itself and so cannot receive props.
 */
export const WorkspacePanesContext = createContext<WorkspacePanes | null>(null)

export function useWorkspacePanes(): WorkspacePanes {
  const value = useContext(WorkspacePanesContext)
  if (!value) throw new Error("useWorkspacePanes must be used inside WorkspaceDock")
  return value
}
