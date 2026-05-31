import { createContext, useContext } from "react"
import type { usePRs } from "@/domains/pull-requests/usePRs"
import type { RefineSession } from "@/domains/tasks/tasks.types"

export interface AppContextValue {
  prs: ReturnType<typeof usePRs>["prs"]
  prsLoading: boolean
  refetchPRs: () => void
  refineSessions: RefineSession[]
  setRefineSessions: React.Dispatch<React.SetStateAction<RefineSession[]>>
  feedbackEnabled: boolean
  githubEnabled: boolean
  sidebarCollapsed: boolean
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppContext must be used within AppLayout")
  return ctx
}
