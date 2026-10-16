export interface ChatTab {
  agentId: string
  title: string
  isChild?: boolean
}

export interface PendingAgent {
  title: string
  branch: string
  repoName: string
  estimatedMs: number
}

export interface DeletingAgent {
  title: string
  branch: string
  repoName: string
}
