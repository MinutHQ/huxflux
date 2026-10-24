import * as path from "node:path"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { defineTagHandler, type TagHandler } from "../../agent-runner/agent-runner.types.js"
import { logger } from "../../../logger.js"
import { ShareFileError, shareFile } from "./sharedFiles.js"

/**
 * Where relative paths resolve. Read at dispatch time, not when the handler is
 * built: a branch tag earlier in the same message may have moved the worktree.
 */
function currentWorktree(agentId: string, fallback: string): string {
  const agent = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get()
  if (!agent?.repoId) return fallback
  const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
  if (!repo) return fallback
  return agent.noWorktree || repo.type === "folder" ? repo.path : path.join(repo.workspacesPath, agent.location)
}

/**
 * `<huxflux:agents.file path="android/app/build/outputs/apk/release/app-release.apk"/>`
 *
 * Copies the file into the agent's shared store and attaches it to the
 * message as a download. A failed share is reported back to the agent as a
 * follow-up turn so it can fix the path or explain the problem to the user.
 */
export function agentFileHandler(agentId: string, worktreePath: string, root?: string): TagHandler {
  return defineTagHandler({
    id: "agents.file",
    args: z.object({ path: z.string().min(1) }),
    onTag: async ({ args }) => {
      try {
        const shared = await shareFile(agentId, args.path, currentWorktree(agentId, worktreePath), root)
        return { sharedFiles: [shared] }
      } catch (err) {
        if (!(err instanceof ShareFileError)) logger.error({ err, agentId }, "[share-file] copy failed")
        const reason = err instanceof Error ? err.message : String(err)
        return {
          followUp: {
            sender: "system",
            content: `Sharing ${args.path} with the user failed: ${reason}`,
          },
        }
      }
    },
  })
}
