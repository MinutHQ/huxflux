// Domain-internal types for the tasks domain.
//
// Cross-platform task types (TaskItem, TaskStatus, TaskComment, TaskAgent)
// live in `@huxflux/shared`. This file owns refine-flow types only, which
// are web-local because the refine session state is persisted in
// localStorage rather than on the server.

export type TaskColumn =
  | "backlog"
  | "refining"
  | "ready"
  | "in-progress"
  | "in-review"
  | "done"

export interface RefineSubtask {
  id: string
  repoId: string
  repoName: string
  title: string
}

export interface RefineMessage {
  id: string
  role: "user" | "agent"
  content: string
  type: "text" | "repo-select"
  timestamp: string
}

export interface RefineSession {
  id: string
  ticketId: string
  status: "repos" | "questions" | "done"
  repoIds: string[]
  messages: RefineMessage[]
  answers: string[]
  subtasks: RefineSubtask[]
  createdAt: string
  agentId?: string
}
