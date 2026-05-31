import { useEffect, useState } from "react"
import {
  api,
  type PRIssueComment,
  type PRThread,
  type PullRequest,
  type PRFile,
} from "@huxflux/shared"
import type { PRDetailsHeader } from "../pull-requests.types"
import { STORAGE_KEYS } from "../config"

interface UsePRDetailsResult {
  fileDiffs: Record<string, string>
  prFiles: PRFile[]
  branch: string
  baseBranch: string
  description: string
  threads: PRThread[]
  issueComments: PRIssueComment[]
  currentUser: string | undefined
  checks: NonNullable<PullRequest["checks"]>
  mergeableState: string
  prDetails: PRDetailsHeader | null
  loadingFiles: boolean
  loadingDetails: boolean
  expandedFiles: Set<string>
  setExpandedFiles: React.Dispatch<React.SetStateAction<Set<string>>>
  setThreads: React.Dispatch<React.SetStateAction<PRThread[]>>
  setIssueComments: React.Dispatch<React.SetStateAction<PRIssueComment[]>>
}

function readViewed(repoId: string | undefined, prNumber: number): Set<string> {
  if (!repoId) return new Set()
  const key = `${STORAGE_KEYS.viewedPrefix}:${repoId}:${prNumber}`
  const raw = localStorage.getItem(key)
  return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
}

/**
 * Loads file diffs + threads + issue comments + checks for a PR on mount.
 * Initialises `expandedFiles` to every not-yet-viewed file so first-time
 * reviewers see unread files expanded by default.
 */
export function usePRDetails(pr: PullRequest): UsePRDetailsResult {
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({})
  const [prFiles, setPrFiles] = useState<PRFile[]>(pr.files)
  const [branch, setBranch] = useState(pr.branch)
  const [baseBranch, setBaseBranch] = useState(pr.baseBranch)
  const [description, setDescription] = useState(pr.description)
  const [threads, setThreads] = useState<PRThread[]>([])
  const [issueComments, setIssueComments] = useState<PRIssueComment[]>([])
  const [currentUser, setCurrentUser] = useState<string | undefined>()
  const [checks, setChecks] = useState<NonNullable<PullRequest["checks"]>>([])
  const [mergeableState, setMergeableState] = useState<string>("")
  const [prDetails, setPrDetails] = useState<PRDetailsHeader | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(!!pr.repoId)
  const [loadingDetails, setLoadingDetails] = useState(!!pr.repoId)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!pr.repoId) return
    loadPRFiles(pr.repoId, pr.number, {
      setFileDiffs,
      setPrFiles,
      setExpandedFiles,
      done: () => setLoadingFiles(false),
    })
    loadPRDetails(pr.repoId, pr.number, pr.url, {
      setBranch,
      setBaseBranch,
      setDescription,
      setCurrentUser,
      setThreads,
      setIssueComments,
      setChecks,
      setMergeableState,
      setPrDetails,
      done: () => setLoadingDetails(false),
    })
  }, [pr.repoId, pr.number, pr.url])

  return {
    fileDiffs,
    prFiles,
    branch,
    baseBranch,
    description,
    threads,
    issueComments,
    currentUser,
    checks,
    mergeableState,
    prDetails,
    loadingFiles,
    loadingDetails,
    expandedFiles,
    setExpandedFiles,
    setThreads,
    setIssueComments,
  }
}

interface FilesLoaderHandlers {
  setFileDiffs: (m: Record<string, string>) => void
  setPrFiles: (f: PRFile[]) => void
  setExpandedFiles: (s: Set<string>) => void
  done: () => void
}

function loadPRFiles(repoId: string, prNumber: number, h: FilesLoaderHandlers) {
  api.prs
    .files(repoId, prNumber)
    .then((files) => {
      const map: Record<string, string> = {}
      const fileList: PRFile[] = []
      for (const f of files) {
        if (f.patch) map[f.path] = f.patch
        fileList.push({ path: f.path, additions: f.additions, deletions: f.deletions, status: f.status })
      }
      h.setFileDiffs(map)
      h.setPrFiles(fileList)
      const viewed = readViewed(repoId, prNumber)
      h.setExpandedFiles(new Set(fileList.filter((f) => !viewed.has(f.path)).map((f) => f.path)))
    })
    .catch(() => {})
    .finally(h.done)
}

interface DetailsLoaderHandlers {
  setBranch: (v: string) => void
  setBaseBranch: (v: string) => void
  setDescription: (v: string) => void
  setCurrentUser: (v: string) => void
  setThreads: (v: PRThread[]) => void
  setIssueComments: (v: PRIssueComment[]) => void
  setChecks: (v: NonNullable<PullRequest["checks"]>) => void
  setMergeableState: (v: string) => void
  setPrDetails: (v: PRDetailsHeader) => void
  done: () => void
}

function loadPRDetails(repoId: string, prNumber: number, fallbackUrl: string | undefined, h: DetailsLoaderHandlers) {
  api.prs
    .detailsForRepo(repoId, prNumber)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((details: any) => {
      if (details.branch) h.setBranch(details.branch)
      if (details.baseBranch) h.setBaseBranch(details.baseBranch)
      if (details.body) h.setDescription(details.body)
      if (details.currentUser) h.setCurrentUser(details.currentUser)
      h.setThreads((details.threads as PRThread[]).filter((t) => t.comments.length > 0))
      h.setIssueComments(details.issueComments ?? [])
      h.setChecks(details.checks ?? [])
      h.setMergeableState(details.mergeableState ?? "")
      h.setPrDetails({
        title: details.title,
        body: details.body,
        author: details.author,
        avatarUrl: details.avatarUrl,
        createdAt: details.createdAt,
        url: details.url ?? fallbackUrl ?? "",
        headSha: details.headSha,
      })
    })
    .catch(() => {})
    .finally(h.done)
}
