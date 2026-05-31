export type Period = "wtd" | "last-week" | "last-month" | "last-year" | "custom"
export type Length = "short" | "medium" | "long"

export interface DateRange {
  from: string
  to: string
  periodKey: string
  label: string
}

export interface ShippedRow {
  title: string
  description: string | null
  status: string
  repoName: string | null
  additions: number
  deletions: number
  fileCount: number
}

export interface InProgressRow {
  title: string
  repoName: string | null
}

export interface FileRow {
  path: string
  repoName: string | null
  total: number
}

export interface WrappedStats {
  period: string
  from: string
  to: string
  agents: number
  done: number
  inProgress: number
  inReview: number
  cancelled: number
  backlog: number
  messages: number
  tokens: string
  toolCalls: number
  files: number
  additions: number
  deletions: number
  avgDuration: string
  shipped: string[]
  inProgressTitles: string[]
  topFiles: string[]
  repos: string
}

export interface GatheredStats {
  totalAgents: number
  doneCount: number
  inReviewCount: number
  inProgressCount: number
  totalMessages: number
  totalTokens: number
  totalToolCalls: number
  totalFiles: number
  additions: number
  deletions: number
  avgDuration: string
  shippedAgents: ShippedRow[]
  inProgressAgents: InProgressRow[]
  topFiles: FileRow[]
  reposLabel: string
  statusMap: Record<string, number>
}
