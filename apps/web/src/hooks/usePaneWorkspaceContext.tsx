import { createContext, useContext, type ReactNode } from "react"
import { usePaneWorkspace } from "./usePaneWorkspace"

type PaneWorkspaceValue = ReturnType<typeof usePaneWorkspace>

const PaneWorkspaceContext = createContext<PaneWorkspaceValue | null>(null)

export function PaneWorkspaceProvider({ agentId, children }: { agentId: string; children: ReactNode }) {
  const workspace = usePaneWorkspace(agentId)
  return <PaneWorkspaceContext.Provider value={workspace}>{children}</PaneWorkspaceContext.Provider>
}

export function usePaneWorkspaceContext(): PaneWorkspaceValue {
  const ctx = useContext(PaneWorkspaceContext)
  if (!ctx) throw new Error("usePaneWorkspaceContext must be used within PaneWorkspaceProvider")
  return ctx
}
