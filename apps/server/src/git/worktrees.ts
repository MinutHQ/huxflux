import { simpleGit } from "simple-git"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
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

async function refExists(git: ReturnType<typeof simpleGit>, ref: string): Promise<boolean> {
  try {
    await git.raw(["rev-parse", "--verify", `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

export async function createWorktree(repoPath: string, branch: string, worktreePath: string, startPoint?: string): Promise<void> {
  const git = simpleGit(repoPath)
  await mkdir(path.dirname(worktreePath), { recursive: true })

  // Worktree directory already exists — assume it was created successfully before.
  if (existsSync(worktreePath)) return

  // Pull latest from remote so the worktree starts from an up-to-date base
  if (startPoint) {
    const remote = startPoint.startsWith("origin/") ? startPoint.replace(/^origin\//, "") : startPoint
    await git.fetch(["--no-tags", "origin", remote]).catch(() => {})
  }

  const branches = await git.branch(["-a"])

  // Check if a LOCAL branch with this name already exists
  const localBranchExists = branches.all.some((b) => {
    const normalized = b.replace(/^\* /, "").trim()
    return normalized === branch
  })

  // Resolve the effective start point. Prefer origin/ ref if available so the
  // worktree always starts from the latest remote state, not a stale local branch.
  let effectiveStart: string | undefined
  if (startPoint) {
    if (startPoint.startsWith("origin/") && await refExists(git, startPoint)) {
      effectiveStart = startPoint
    } else {
      // Try origin/<startPoint> first (freshly fetched), fall back to local
      const originRef = `origin/${startPoint}`
      if (await refExists(git, originRef)) {
        effectiveStart = originRef
      } else if (await refExists(git, startPoint)) {
        effectiveStart = startPoint
      }
    }
  }

  async function doAdd(): Promise<void> {
    if (localBranchExists) {
      await git.raw(["worktree", "add", worktreePath, branch])
    } else if (effectiveStart) {
      await git.raw(["worktree", "add", "-b", branch, worktreePath, effectiveStart])
    } else {
      await git.raw(["worktree", "add", "-b", branch, worktreePath])
    }
  }

  try {
    await doAdd()
  } catch (err) {
    // Branch is locked to a stale worktree entry (e.g. from a previously deleted
    // agent whose directory was removed but git metadata wasn't pruned).
    // Prune stale entries and retry once.
    const msg = String((err as Error).message ?? err)
    if (msg.includes("is already used by worktree") || msg.includes("already checked out")) {
      await git.raw(["worktree", "prune"])
      await doAdd()
    } else {
      throw err
    }
  }

  // Exclude huxflux temp files via .git/info/exclude (local-only, never committed)
  try {
    const { readFile, appendFile, mkdir: mkdirFs } = await import("node:fs/promises")
    // Worktrees use a .git file pointing to the main repo — resolve the actual git dir
    const dotGit = path.join(worktreePath, ".git")
    let gitDir = dotGit
    if (existsSync(dotGit)) {
      const content = await readFile(dotGit, "utf8").catch(() => "")
      const match = content.match(/^gitdir:\s*(.+)/m)
      if (match) gitDir = path.resolve(worktreePath, match[1].trim())
    }
    const infoDir = path.join(gitDir, "info")
    await mkdirFs(infoDir, { recursive: true })
    const excludeFile = path.join(infoDir, "exclude")
    const existing = await readFile(excludeFile, "utf8").catch(() => "")
    if (!existing.includes(".huxflux_attachments")) {
      await appendFile(excludeFile, `${existing.endsWith("\n") || !existing ? "" : "\n"}.huxflux_attachments\n`)
    }
  } catch { /* non-critical */ }
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const git = simpleGit(repoPath)
  try {
    await git.raw(["worktree", "remove", "--force", worktreePath])
  } catch {
    await git.raw(["worktree", "prune"])
  }
}

/** Relocate a worktree to a new path. Caller must ensure no process is using the old path. */
export async function moveWorktree(repoPath: string, oldPath: string, newPath: string): Promise<void> {
  const git = simpleGit(repoPath)
  await git.raw(["worktree", "move", oldPath, newPath])
}

/** Resolve the merge-base commit between HEAD and the base branch. */
async function resolveBase(worktreePath: string, branchFrom: string): Promise<string> {
  const git = simpleGit(worktreePath)
  // Try candidates in order: configured branchFrom, local equivalent, common defaults
  const candidates = [...new Set([
    branchFrom,
    branchFrom.replace(/^origin\//, ""),
    "origin/main", "origin/master", "main", "master",
  ])]
  for (const candidate of candidates) {
    try {
      const mb = await git.raw(["merge-base", "HEAD", candidate])
      if (mb.trim()) return mb.trim()
    } catch { /* try next */ }
  }
  try {
    const root = await git.raw(["rev-list", "--max-parents=0", "HEAD"])
    if (root.trim()) return root.trim()
  } catch { /* ignore */ }
  return "HEAD"
}

export async function getFileChanges(worktreePath: string, branchFrom: string): Promise<FileChange[]> {
  const git = simpleGit(worktreePath)

  try {
    const base = await resolveBase(worktreePath, branchFrom)
    const fileMap = new Map<string, FileChange>()

    const addDiff = (files: Array<{ file: string; [key: string]: unknown }>) => {
      for (const f of files) {
        const existing = fileMap.get(f.file)
        const add = "insertions" in f ? (f.insertions as number) : 0
        const del = "deletions" in f ? (f.deletions as number) : 0
        if (existing) {
          existing.additions += add
          existing.deletions += del
        } else {
          fileMap.set(f.file, { path: f.file, additions: add, deletions: del })
        }
      }
    }

    // Committed changes on this branch since it diverged from base
    const committed = await git.diffSummary([`${base}..HEAD`]).catch(() => null)
    if (committed) addDiff(committed.files)

    // Uncommitted changes (staged + unstaged) on top of HEAD
    const uncommitted = await git.diffSummary(["HEAD"]).catch(() => null)
    if (uncommitted) addDiff(uncommitted.files)

    // Untracked new files not yet in any diff
    const untrackedRaw = await git.raw(["ls-files", "--others", "--exclude-standard"])
    const untrackedPaths = untrackedRaw.trim().split("\n").filter(Boolean)
    await Promise.all(
      untrackedPaths.map(async (filePath) => {
        if (fileMap.has(filePath)) return
        try {
          const content = await readFile(path.join(worktreePath, filePath), "utf8")
          fileMap.set(filePath, { path: filePath, additions: content.split("\n").length, deletions: 0 })
        } catch {
          fileMap.set(filePath, { path: filePath, additions: 0, deletions: 0 })
        }
      })
    )

    return Array.from(fileMap.values())
  } catch {
    return []
  }
}

export async function getDiff(worktreePath: string, filePath: string, branchFrom: string): Promise<string> {
  const git = simpleGit(worktreePath)
  try {
    const base = await resolveBase(worktreePath, branchFrom)
    const diff = await git.diff([base, "-U2", "--", filePath])
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

export interface FileTreeEntry {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileTreeEntry[]
}

export async function getFileTree(worktreePath: string): Promise<FileTreeEntry[]> {
  const git = simpleGit(worktreePath)
  try {
    // List all tracked files + untracked (but not ignored)
    const tracked = await git.raw(["ls-files"])
    const untracked = await git.raw(["ls-files", "--others", "--exclude-standard"])
    const allPaths = [...new Set([
      ...tracked.trim().split("\n").filter(Boolean),
      ...untracked.trim().split("\n").filter(Boolean),
    ])].sort()

    // Build tree structure
    const root: FileTreeEntry[] = []
    const dirMap = new Map<string, FileTreeEntry>()

    for (const filePath of allPaths) {
      const parts = filePath.split("/")
      let currentChildren = root
      let currentPath = ""

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        currentPath = currentPath ? `${currentPath}/${part}` : part

        if (i === parts.length - 1) {
          // File
          currentChildren.push({ name: part, path: currentPath, type: "file" })
        } else {
          // Directory
          let dir = dirMap.get(currentPath)
          if (!dir) {
            dir = { name: part, path: currentPath, type: "directory", children: [] }
            dirMap.set(currentPath, dir)
            currentChildren.push(dir)
          }
          currentChildren = dir.children!
        }
      }
    }

    return root
  } catch {
    return []
  }
}

export async function getFileContent(worktreePath: string, filePath: string): Promise<string> {
  try {
    return await readFile(path.join(worktreePath, filePath), "utf8")
  } catch {
    return ""
  }
}

export async function getBaseFileContent(worktreePath: string, filePath: string, branchFrom: string): Promise<string> {
  const git = simpleGit(worktreePath)
  try {
    const base = await resolveBase(worktreePath, branchFrom)
    return await git.raw(["show", `${base}:${filePath}`])
  } catch {
    return ""
  }
}

export async function saveFileContent(worktreePath: string, filePath: string, content: string): Promise<void> {
  const fullPath = path.join(worktreePath, filePath)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, "utf8")
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
