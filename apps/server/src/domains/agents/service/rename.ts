import { existsSync, renameSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { and, eq, isNull, ne } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { moveWorktree } from "../../git/worktrees.js"
import { unwatchWorktree, watchWorktree } from "../../git/watcher.js"
import { hasActivePty } from "../../ws/pty.js"
import { agentsWs } from "../agents.ws.js"
import type { AgentSummary } from "../../../types.js"

/**
 * Claude Code stores per-conversation history under
 * `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, where the encoded cwd
 * replaces every `/` and `.` with `-`. When we move a worktree, that directory
 * has to move with it or `claude --resume` will exit with code 1 and
 * "No conversation found with session ID".
 */
function encodeClaudeProjectKey(cwd: string): string {
  return cwd.replace(/[./]/g, "-")
}

function moveClaudeSessionDir(oldCwd: string, newCwd: string): void {
  const oldKey = encodeClaudeProjectKey(oldCwd)
  const newKey = encodeClaudeProjectKey(newCwd)
  if (oldKey === newKey) return
  const projectsRoot = path.join(os.homedir(), ".claude", "projects")
  const oldDir = path.join(projectsRoot, oldKey)
  const newDir = path.join(projectsRoot, newKey)
  if (!existsSync(oldDir)) return
  if (existsSync(newDir)) {
    console.warn(`[rename] claude session dir already exists at "${newDir}" — leaving "${oldDir}" in place`)
    return
  }
  try {
    renameSync(oldDir, newDir)
    console.info(`[rename] claude session dir moved: "${oldKey}" → "${newKey}"`)
  } catch (err) {
    console.warn(`[rename] claude session dir move failed (will fall back to conversation context):`, err)
  }
}

const BEE_NAME_RE = /^[a-z]+-[a-z]+-[a-z0-9]{5}$/

/** True if the agent's title or branch suffix still matches the random-bee placeholder. */
export function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return false
  return BEE_NAME_RE.test(name.trim())
}

function sanitizeBranchName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9/._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
}

function slugForLocation(branch: string, prefix: string): string {
  const stripped = prefix && branch.startsWith(prefix) ? branch.slice(prefix.length) : branch
  return stripped.replace(/\//g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

export interface ApplyBranchRenameResult {
  ok: boolean
  reason?: string
  branch?: string
  location?: string
  worktreePath?: string
}

/**
 * Move the worktree directory so it matches the agent's current branch slug.
 *
 * Used to reconcile agents whose branch was renamed but whose folder still
 * carries the old `pool-XXX` / `workspace-XXX` / placeholder name. Does NOT
 * touch git — only the directory and the DB `location` column.
 *
 * Returns `ok: true` even when nothing needed to move (already aligned).
 */
export async function reconcileWorktreeLocation(
  agentId: string,
  opts: { branchFrom?: string } = {},
): Promise<ApplyBranchRenameResult> {
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!agent || agent.deletedAt) return { ok: false, reason: "agent not found" }
  if (!agent.repoId) return { ok: false, reason: "agent has no repo" }
  if (agent.noWorktree || agent.parentAgentId) return { ok: true, reason: "no top-level worktree to align" }
  const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
  if (!repo) return { ok: false, reason: "repo not found" }
  if (repo.type === "folder") return { ok: true }

  const prefix = repo.branchPrefix ? `${repo.branchPrefix}/` : ""
  const branch = agent.branch ?? ""
  if (!branch) return { ok: true, reason: "no branch set" }
  const slug = slugForLocation(branch, prefix)
  if (!slug || slug.includes("/")) return { ok: true, reason: "no valid slug from branch" }
  if (slug === agent.location) return { ok: true, location: agent.location, worktreePath: path.join(repo.workspacesPath, agent.location) }

  const sharing = db.select({ id: agentsTable.id }).from(agentsTable)
    .where(and(
      eq(agentsTable.location, agent.location),
      eq(agentsTable.repoId, agent.repoId),
      ne(agentsTable.id, agentId),
      isNull(agentsTable.deletedAt),
    ))
    .all()
  if (sharing.length > 0) return { ok: true, reason: `worktree shared with ${sharing.length} other agent(s)` }
  if (hasActivePty(agentId)) return { ok: true, reason: "PTY active" }

  const oldPath = path.join(repo.workspacesPath, agent.location)
  const newPath = path.join(repo.workspacesPath, slug)
  if (!existsSync(oldPath)) return { ok: false, reason: "current worktree path does not exist" }

  const takenInDb = db.select({ id: agentsTable.id }).from(agentsTable)
    .where(and(eq(agentsTable.location, slug), isNull(agentsTable.deletedAt)))
    .get()
  if ((takenInDb && takenInDb.id !== agentId) || existsSync(newPath)) {
    return { ok: true, reason: `target "${slug}" already in use` }
  }

  unwatchWorktree(agentId)
  try {
    await moveWorktree(repo.path, oldPath, newPath)
    db.update(agentsTable)
      .set({ location: slug, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId))
      .run()
    watchWorktree(agentId, newPath, opts.branchFrom ?? agent.baseBranch ?? repo.branchFrom ?? "HEAD")
    moveClaudeSessionDir(oldPath, newPath)
    const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
    console.info(`[reconcile] worktree moved: "${agent.location}" → "${slug}"`)
    return { ok: true, branch, location: slug, worktreePath: newPath }
  } catch (err) {
    if (existsSync(newPath) && !existsSync(oldPath)) {
      db.update(agentsTable)
        .set({ location: slug, updatedAt: new Date().toISOString() })
        .where(eq(agentsTable.id, agentId))
        .run()
      watchWorktree(agentId, newPath, opts.branchFrom ?? agent.baseBranch ?? repo.branchFrom ?? "HEAD")
      moveClaudeSessionDir(oldPath, newPath)
      const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
      return { ok: true, branch, location: slug, worktreePath: newPath }
    }
    if (existsSync(oldPath)) watchWorktree(agentId, oldPath, opts.branchFrom ?? agent.baseBranch ?? repo.branchFrom ?? "HEAD")
    return { ok: false, reason: `worktree move failed: ${(err as Error).message}` }
  }
}

/**
 * Rename an agent's git branch (and optionally relocate its worktree) safely.
 *
 * Performs: branch sanitization, prefix prepend, git branch -m, DB update,
 * worktree directory rename, file-watcher reattach, broadcast.
 *
 * Skips the worktree move (but still renames the branch) when:
 * - The worktree is shared with another non-deleted agent
 * - A PTY is currently attached to the agent
 * - The target slug is already taken in the DB or on disk
 *
 * Used by:
 * - The `<huxflux:agents.branch>` tag handler in `service/runnerTags.ts`
 * - The `POST /api/agents/:id/rename-branch` route (manual rename)
 * - The first-turn auto-rename fallback when the agent never emits the tag
 */
export async function applyBranchRename(
  agentId: string,
  rawBranchName: string,
  opts: { branchFrom?: string } = {},
): Promise<ApplyBranchRenameResult> {
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!agent || agent.deletedAt) return { ok: false, reason: "agent not found" }
  if (!agent.repoId) return { ok: false, reason: "agent has no repo" }
  const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
  if (!repo) return { ok: false, reason: "repo not found" }
  if (repo.type === "folder") return { ok: true }

  const sanitized = sanitizeBranchName(rawBranchName)
  if (!sanitized) return { ok: false, reason: "name is empty after sanitization" }
  const prefix = repo.branchPrefix ? `${repo.branchPrefix}/` : ""
  const newBranch = sanitized.startsWith(prefix) ? sanitized : `${prefix}${sanitized}`

  // Collision check on branch name across active agents in the same repo.
  const branchConflict = db.select({ id: agentsTable.id, title: agentsTable.title }).from(agentsTable)
    .where(and(eq(agentsTable.repoId, agent.repoId), eq(agentsTable.branch, newBranch), isNull(agentsTable.deletedAt)))
    .get()
  if (branchConflict && branchConflict.id !== agentId) {
    return { ok: false, reason: `branch "${newBranch}" is already used by "${branchConflict.title}"` }
  }

  const oldLocation = agent.location
  const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, oldLocation)

  if (agent.branch !== newBranch) {
    const { simpleGit } = await import("simple-git")
    const git = simpleGit(worktreePath)
    try {
      const current = (await git.revparse(["--abbrev-ref", "HEAD"])).trim()
      if (current !== newBranch) await git.raw(["branch", "-m", current, newBranch])
    } catch (err) {
      return { ok: false, reason: `git branch -m failed: ${(err as Error).message}` }
    }
    db.update(agentsTable)
      .set({ branch: newBranch, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId))
      .run()
  }

  const moved = await maybeRelocateWorktree({
    agent, repo, prefix, newBranch, oldLocation, worktreePath, agentId,
    branchFromOverride: opts.branchFrom,
  })

  const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)

  return { ok: true, branch: newBranch, location: moved.location, worktreePath: moved.worktreePath }
}

interface RelocateArgs {
  agent: typeof agentsTable.$inferSelect
  repo: typeof reposTable.$inferSelect
  prefix: string
  newBranch: string
  oldLocation: string
  worktreePath: string
  agentId: string
  branchFromOverride?: string
}

async function maybeRelocateWorktree(args: RelocateArgs): Promise<{ location: string; worktreePath: string }> {
  const { agent, repo, prefix, newBranch, oldLocation, worktreePath, agentId } = args
  // Worktree relocation — only for top-level worktrees that no one else shares,
  // and only when no PTY is attached (the cwd would become invalid mid-shell).
  if (agent.noWorktree || agent.parentAgentId) {
    return { location: oldLocation, worktreePath }
  }
  const sharing = db.select({ id: agentsTable.id }).from(agentsTable)
    .where(and(
      eq(agentsTable.location, oldLocation),
      eq(agentsTable.repoId, agent.repoId!),
      ne(agentsTable.id, agentId),
      isNull(agentsTable.deletedAt),
    ))
    .all()
  if (sharing.length > 0) {
    console.info(`[rename] worktree move skipped: ${sharing.length} other agent(s) share this worktree`)
    return { location: oldLocation, worktreePath }
  }
  if (hasActivePty(agentId)) {
    console.info(`[rename] worktree move skipped: PTY active for agent ${agentId}`)
    return { location: oldLocation, worktreePath }
  }
  const slug = slugForLocation(newBranch, prefix)
  if (!slug || slug.includes("/") || slug === oldLocation) {
    return { location: oldLocation, worktreePath }
  }
  const newPath = path.join(repo.workspacesPath, slug)
  const takenInDb = db.select({ id: agentsTable.id }).from(agentsTable)
    .where(and(eq(agentsTable.location, slug), isNull(agentsTable.deletedAt)))
    .get()
  const takenOnDisk = existsSync(newPath)
  if (takenInDb || takenOnDisk) {
    console.info(`[rename] worktree move skipped: target "${slug}" already in use`)
    return { location: oldLocation, worktreePath }
  }
  return performWorktreeMove(args, newPath, slug)
}

async function performWorktreeMove(
  args: RelocateArgs,
  newPath: string,
  slug: string,
): Promise<{ location: string; worktreePath: string }> {
  const { agent, repo, oldLocation, worktreePath, agentId, branchFromOverride } = args
  const branchFrom = branchFromOverride ?? agent.baseBranch ?? repo.branchFrom ?? "HEAD"

  unwatchWorktree(agentId)
  try {
    await moveWorktree(repo.path, worktreePath, newPath)
    db.update(agentsTable)
      .set({ location: slug, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId))
      .run()
    watchWorktree(agentId, newPath, branchFrom)
    moveClaudeSessionDir(worktreePath, newPath)
    console.info(`[rename] worktree moved: "${oldLocation}" → "${slug}"`)
    return { location: slug, worktreePath: newPath }
  } catch (err) {
    console.error(`[rename] worktree move failed:`, err)
    return reconcileFailedMove(agentId, slug, worktreePath, newPath, branchFrom)
  }
}

function reconcileFailedMove(
  agentId: string,
  slug: string,
  worktreePath: string,
  newPath: string,
  branchFrom: string,
): { location: string; worktreePath: string } {
  // Reconcile after a partial failure: if the move physically completed
  // but the DB write didn't, the dir is at newPath. Update DB and watch
  // newPath so we don't end up with a stranded agent.
  if (existsSync(newPath) && !existsSync(worktreePath)) {
    db.update(agentsTable)
      .set({ location: slug, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId))
      .run()
    watchWorktree(agentId, newPath, branchFrom)
    moveClaudeSessionDir(worktreePath, newPath)
    console.info(`[rename] worktree move reconciled at "${newPath}"`)
    return { location: slug, worktreePath: newPath }
  }
  if (existsSync(worktreePath)) {
    watchWorktree(agentId, worktreePath, branchFrom)
  } else {
    console.error(`[rename] agent ${agentId} left with no usable path`)
  }
  // Fall back to the original location — caller already read it from the DB row.
  const current = db.select({ location: agentsTable.location }).from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .get()
  return { location: current?.location ?? slug, worktreePath }
}
