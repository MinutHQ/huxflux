// Domain-internal types for the tasks domain.
//
// The wire-shape types (TaskItem, TaskComment, TaskStatus, etc.) live in
// `@huxflux/shared/domains/tasks`. The "*Out" variants here are the
// server-side row shapes returned by `loadAllTasks` — they mirror the shared
// types verbatim but stay local so this domain doesn't take a hard runtime
// dependency on the package while it composes its result objects.

export type TaskStatus = "backlog" | "refining" | "ready" | "in-progress" | "in-review" | "done"

export interface TaskCommentOut {
  id: string
  author: string
  role: "ai" | "user"
  content: string
  agentId?: string | null
  createdAt: string
}

export interface TaskAgentOut {
  agentId: string
  agentTitle: string
  agentStatus: string
  agentBranch: string
  prNumber: number | null
  prUrl: string | null
  prMerged: boolean
  prDraft: boolean
  ciStatus: "passing" | "failing" | "pending" | null
}

export interface TaskItemOut {
  id: string
  parentId: string | null
  jiraKey: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: string | null
  assignee: string | null
  projectKey: string | null
  repoId: string | null
  repoName: string | null
  refineAgentId: string | null
  agents: TaskAgentOut[]
  comments: TaskCommentOut[]
  subtasks: TaskItemOut[]
  dependencies: string[]
  sprintName: string | null
  sprintState: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskAgentRow {
  taskId: string
  agentId: string
  title: string
  status: string
  branch: string
  pr: string | null
  prNumber: number | null
  prStatus: string | null
}

export interface TaskDepRow {
  taskId: string
  dependsOnTaskId: string
}
