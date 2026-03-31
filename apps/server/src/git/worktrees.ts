import { simpleGit } from "simple-git"
import { readFile, mkdir } from "node:fs/promises"
import * as path from "node:path"
import type { FileChange } from "../types.js"

export async function getRemoteUrl(repoPath: string, remote = "origin"): Promise<string | null> {
  try {
    const git = simpleGit(repoPath)
    const url = await git.remote(["get-url", remote])
    return url?.trim() ?? null
  } catch {
    return null
  }
}

export async function createWorktree(repoPath: string, branch: string, worktreePath: string, startPoint?: string): Promise<void> {
  const git = simpleGit(repoPath)
  await mkdir(path.dirname(worktreePath), { recursive: true })

  const branches = await git.branch(["-a"])
  const branchExists = branches.all.some((b) => b.replace(/^remotes\//, "").replace(/^\* /, "") === branch)

  if (branchExists) {
    await git.raw(["worktree", "add", worktreePath, branch])
  } else if (startPoint) {
    // Branch from the specified remote tracking branch (e.g. origin/main)
    await git.raw(["worktree", "add", "-b", branch, worktreePath, startPoint])
  } else {
    await git.raw(["worktree", "add", "-b", branch, worktreePath])
  }
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const git = simpleGit(repoPath)
  try {
    await git.raw(["worktree", "remove", "--force", worktreePath])
  } catch {
    await git.raw(["worktree", "prune"])
  }
}

/** Resolve the merge-base commit between HEAD and the base branch. */
async function resolveBase(worktreePath: string, branchFrom: string): Promise<string> {
  const git = simpleGit(worktreePath)
  try {
    const mergeBase = await git.raw(["merge-base", "HEAD", branchFrom])
    return mergeBase.trim()
  } catch {
    // branchFrom not found (e.g. offline, no fetch yet) — fall back to HEAD
    return "HEAD"
  }
}

export async function getFileChanges(worktreePath: string, branchFrom: string): Promise<FileChange[]> {
  const git = simpleGit(worktreePath)

  try {
    const base = await resolveBase(worktreePath, branchFrom)

    // All tracked changes (committed or not) since the branch diverged from base
    const diffStat = await git.diffSummary([base])
    const tracked: FileChange[] = diffStat.files.map((f) => ({
      path: f.file,
      additions: "insertions" in f ? (f.insertions as number) : 0,
      deletions: "deletions" in f ? (f.deletions as number) : 0,
    }))

    // Untracked new files — not included in any git diff
    const untrackedRaw = await git.raw(["ls-files", "--others", "--exclude-standard"])
    const untrackedPaths = untrackedRaw.trim().split("\n").filter(Boolean)
    const untracked: FileChange[] = await Promise.all(
      untrackedPaths.map(async (filePath) => {
        try {
          const content = await readFile(path.join(worktreePath, filePath), "utf8")
          return { path: filePath, additions: content.split("\n").length, deletions: 0 }
        } catch {
          return { path: filePath, additions: 0, deletions: 0 }
        }
      })
    )

    return [...tracked, ...untracked]
  } catch {
    return []
  }
}

export async function getDiff(worktreePath: string, filePath: string, branchFrom: string): Promise<string> {
  const git = simpleGit(worktreePath)
  try {
    const base = await resolveBase(worktreePath, branchFrom)
    const diff = await git.diff([base, "--", filePath])
    if (diff) return diff
    // Untracked new file — render as full addition
    const content = await readFile(path.join(worktreePath, filePath), "utf8")
    const lines = content.split("\n")
    const added = lines.map((l) => `+${l}`).join("\n")
    return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${added}\n`
  } catch {
    return ""
  }
}

export async function commitAndPush(
  worktreePath: string,
  message: string,
  remote = "origin"
): Promise<void> {
  const git = simpleGit(worktreePath)
  await git.add(".")
  await git.commit(message)
  const branch = (await git.branch()).current
  await git.push(remote, branch, ["--set-upstream"])
}

export async function getDiffSummary(worktreePath: string, branchFrom: string) {
  const files = await getFileChanges(worktreePath, branchFrom)
  const additions = files.reduce((s, f) => s + f.additions, 0)
  const deletions = files.reduce((s, f) => s + f.deletions, 0)
  const git = simpleGit(worktreePath)
  let commits = 0
  try {
    const base = await resolveBase(worktreePath, branchFrom)
    const log = await git.log([`${base}..HEAD`])
    commits = log.total
  } catch { /* not fatal */ }
  return { additions, deletions, commits }
}
