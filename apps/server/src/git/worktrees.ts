import { simpleGit } from "simple-git"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { FileChange } from "../types.js"

export async function createWorktree(repoPath: string, branch: string, worktreePath: string): Promise<void> {
  const git = simpleGit(repoPath)
  await fs.mkdir(path.dirname(worktreePath), { recursive: true })

  // Check if branch exists remotely; create if not
  const branches = await git.branch(["-a"])
  const branchExists = branches.all.some((b) => b.includes(branch))

  if (branchExists) {
    await git.raw(["worktree", "add", worktreePath, branch])
  } else {
    // Create new branch from remote default
    await git.raw(["worktree", "add", "-b", branch, worktreePath])
  }
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const git = simpleGit(repoPath)
  try {
    await git.raw(["worktree", "remove", "--force", worktreePath])
  } catch {
    // If worktree is already gone, clean up the reference
    await git.raw(["worktree", "prune"])
  }
}

export async function getFileChanges(worktreePath: string): Promise<FileChange[]> {
  const git = simpleGit(worktreePath)

  try {
    // Get diff stat against HEAD
    const diffStat = await git.diffSummary(["HEAD"])
    return diffStat.files.map((f) => ({
      path: f.file,
      additions: "insertions" in f ? (f.insertions as number) : 0,
      deletions: "deletions" in f ? (f.deletions as number) : 0,
    }))
  } catch {
    return []
  }
}

export async function getDiff(worktreePath: string, filePath: string): Promise<string> {
  const git = simpleGit(worktreePath)
  try {
    return await git.diff(["HEAD", "--", filePath])
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

export async function getDiffSummary(worktreePath: string) {
  const files = await getFileChanges(worktreePath)
  const additions = files.reduce((s, f) => s + f.additions, 0)
  const deletions = files.reduce((s, f) => s + f.deletions, 0)
  const git = simpleGit(worktreePath)
  let commits = 0
  try {
    const log = await git.log(["origin/HEAD..HEAD"])
    commits = log.total
  } catch { /* not fatal */ }
  return { additions, deletions, commits }
}
