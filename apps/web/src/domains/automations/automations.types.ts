// Domain-internal types for the automations UI. Cross-platform Automation
// types come from @huxflux/shared.

export type SetupPhase = "trigger" | "describe" | "building" | "questions" | "done"

export interface MockQuestion {
  id: string
  question: string
  type: "text" | "choice"
  options?: string[]
  answer?: string
}

export interface ChatMessage {
  id: string
  role: "user" | "ai"
  content: string
}
