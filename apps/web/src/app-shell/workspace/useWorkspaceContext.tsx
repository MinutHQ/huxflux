import type { ReactNode } from "react"
import { useWorkspace } from "./useWorkspace"
import { WorkspaceContext } from "./workspaceContext"
import type { AgentSummary } from "@huxflux/shared"

export function WorkspaceProvider({ agents, children }: { agents: AgentSummary[]; children: ReactNode }) {
  const workspace = useWorkspace(agents)
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
}
