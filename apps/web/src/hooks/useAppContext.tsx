import { createContext, useContext } from "react"
import type { usePRs } from "@/hooks/usePRs"
import type { useBulkReview } from "@/hooks/useBulkReview"
import type { RefineSession } from "@/components/RefineView"

export interface AppContextValue {
  prs: ReturnType<typeof usePRs>["prs"]
  prsLoading: boolean
  refetchPRs: () => void
  reviewedPrIds: Set<string>
  setReviewedPrIds: React.Dispatch<React.SetStateAction<Set<string>>>
  userReviewedPrIds: Set<string>
  setUserReviewedPrIds: React.Dispatch<React.SetStateAction<Set<string>>>
  submittedPrIds: Set<string>
  setSubmittedPrIds: React.Dispatch<React.SetStateAction<Set<string>>>
  bulkReview: ReturnType<typeof useBulkReview>
  refineSessions: RefineSession[]
  setRefineSessions: React.Dispatch<React.SetStateAction<RefineSession[]>>
  feedbackEnabled: boolean
  githubEnabled: boolean
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppContext must be used within AppLayout")
  return ctx
}

// DnD state contexts
export const DndDraggingContext = createContext(false)
export function useIsDragging() { return useContext(DndDraggingContext) }

export const DndJustDraggedContext = createContext<React.RefObject<boolean>>({ current: false })
export function useDndJustDragged() { return useContext(DndJustDraggedContext) }
