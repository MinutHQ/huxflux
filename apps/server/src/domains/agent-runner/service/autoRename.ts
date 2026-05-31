import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { messages as messagesTable, agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type { AgentSummary } from "../../../types.js"
import { applyBranchRename, isPlaceholderName, reconcileWorktreeLocation } from "../../agents/rename.js"
import { generateTitle, deriveTitle, titleToBranchSlug } from "../../agents/title.js"

/**
 * If the agent still carries the random-bee placeholder title/branch after a
 * turn, derive a title from the first user message (via Haiku, or a slug-cut
 * fallback) and apply matching title + branch + worktree rename.
 *
 * Runs at most one Haiku call per turn; subsequent turns will retry if the
 * previous attempt failed. No-ops once the placeholder is replaced.
 */
export async function tryAutoRename(agentId: string, branchFrom: string): Promise<void> {
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!agent || agent.deletedAt) return
  if (!agent.repoId) return
  if (agent.parentAgentId) return // children share the parent's branch/worktree

  const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()

  // Folder repos: only auto-rename the title, never touch branches/worktrees.
  if (repo?.type === "folder") {
    if (isPlaceholderName(agent.title)) {
      const firstUserMsg = findFirstUserMessage(agentId)
      if (!firstUserMsg?.content?.trim()) return
      const synthesizedTitle = await synthesizeTitle(firstUserMsg.content)
      if (!synthesizedTitle) return
      db.update(agentsTable)
        .set({ title: synthesizedTitle, updatedAt: new Date().toISOString() })
        .where(eq(agentsTable.id, agentId))
        .run()
      const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
      if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
    }
    return
  }

  const titleNeedsFix = isPlaceholderName(agent.title)
  // Branch placeholder check: strip the repo prefix before comparing.
  const prefix = repo?.branchPrefix ? `${repo.branchPrefix}/` : ""
  const branchSuffix = agent.branch?.startsWith(prefix) ? agent.branch.slice(prefix.length) : (agent.branch ?? "")
  const branchNeedsFix = isPlaceholderName(branchSuffix)

  // Even when both name fields are real, the folder may still be a legacy
  // pool-XXX / workspace-XXX from before the auto-rename existed. Reconcile
  // it now so the worktree path catches up to the branch.
  if (!titleNeedsFix && !branchNeedsFix) {
    await reconcileWorktreeLocation(agentId, { branchFrom })
    return
  }

  const firstUserMsg = findFirstUserMessage(agentId)
  if (!firstUserMsg?.content?.trim()) return

  const synthesizedTitle = await synthesizeTitle(firstUserMsg.content)
  if (!synthesizedTitle) return

  if (titleNeedsFix) {
    db.update(agentsTable)
      .set({ title: synthesizedTitle, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId))
      .run()
    const updated = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
    if (updated) agentsWs.agentUpdated(updated as unknown as AgentSummary)
    console.info(`[auto-rename] title: "${agent.title}" → "${synthesizedTitle}"`)
  }

  if (branchNeedsFix) {
    const slug = titleToBranchSlug(synthesizedTitle)
    if (slug) {
      const result = await applyBranchRename(agentId, slug, { branchFrom })
      if (!result.ok) console.error(`[auto-rename] branch rename failed:`, result.reason)
    }
  }
}

function findFirstUserMessage(agentId: string): { content: string | null } | undefined {
  return db.select().from(messagesTable)
    .where(eq(messagesTable.agentId, agentId))
    .all()
    .sort((a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt))
    .find((m: { role: string }) => m.role === "user")
}

async function synthesizeTitle(content: string): Promise<string> {
  try {
    return await generateTitle(content)
  } catch {
    return deriveTitle(content)
  }
}
