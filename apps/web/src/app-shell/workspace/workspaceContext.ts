import { createContext, useContext } from "react"
import type { useWorkspace } from "./useWorkspace"

type WorkspaceValue = ReturnType<typeof useWorkspace>

export const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspaceContext(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspaceContext must be used within WorkspaceProvider")
  return ctx
}
