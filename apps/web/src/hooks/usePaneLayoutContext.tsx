import { createContext, useContext, type ReactNode } from "react"
import { usePaneLayout } from "./usePaneLayout"
import type { AgentSummary } from "@huxflux/shared"

type PaneLayoutValue = ReturnType<typeof usePaneLayout>

const PaneLayoutContext = createContext<PaneLayoutValue | null>(null)

export function PaneLayoutProvider({ agents, initialAgentId, children }: { agents: AgentSummary[]; initialAgentId: string | null; children: ReactNode }) {
  const layout = usePaneLayout(agents, initialAgentId)
  return <PaneLayoutContext.Provider value={layout}>{children}</PaneLayoutContext.Provider>
}

export function usePaneLayoutContext(): PaneLayoutValue {
  const ctx = useContext(PaneLayoutContext)
  if (!ctx) throw new Error("usePaneLayoutContext must be used within PaneLayoutProvider")
  return ctx
}
