import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { fileChanges as fileChangesTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import { getFileChanges } from "../../git/worktrees.js"

export async function refreshFileChanges(
  agentId: string,
  worktreePath: string,
  branchFrom: string,
): Promise<void> {
  try {
    const files = await getFileChanges(worktreePath, branchFrom)

    // Persist to DB so the file list survives page reloads
    await db.delete(fileChangesTable).where(eq(fileChangesTable.agentId, agentId))
    for (const f of files) {
      await db.insert(fileChangesTable).values({
        id: `${agentId}-${f.path.replace(/[/\\]/g, "-")}`,
        agentId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
      })
    }

    agentsWs.fileChanged(agentId, files)
  } catch { /* not fatal */ }
}
