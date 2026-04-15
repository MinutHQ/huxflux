import { createContext, useContext, type ReactNode } from "react"
import { useWorkspace } from "./useWorkspace"
import type { AgentSummary } from "@huxflux/shared"

type WorkspaceValue = ReturnType<typeof useWorkspace>

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ agents, children }: { agents: AgentSummary[]; children: ReactNode }) {
  const workspace = useWorkspace(agents)
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
}

export function useWorkspaceContext(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspaceContext must be used within WorkspaceProvider")
  return ctx
}
