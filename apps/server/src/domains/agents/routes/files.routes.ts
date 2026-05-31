import type { FastifyReply } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { existsSync } from "node:fs"
import { eq } from "drizzle-orm"
import { saveFileContentBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, fileChanges, repos } from "../../../db/schema.js"
import { getFileChanges, getDiff, getFileTree, getFileContent, saveFileContent, getBaseFileContent } from "../../git/worktrees.js"
import * as path from "node:path"

const idParamsSchema = z.object({ id: z.string() })
const pathQuerySchema = z.object({ path: z.string().optional() })

/** Resolve the agent + repo + worktreePath triple, or send the appropriate 4xx and return null. */
function resolveAgentWorktree(id: string, reply: FastifyReply):
  | { agent: typeof agents.$inferSelect; repo: typeof repos.$inferSelect; worktreePath: string }
  | null {
  const agent = db.select().from(agents).where(eq(agents.id, id)).get()
  if (!agent) { reply.code(404).send({ error: "Not found" }); return null }
  if (!agent.repoId) { reply.code(400).send({ error: "Agent has no linked repo" }); return null }
  const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
  if (!repo) { reply.code(404).send({ error: "Repo not found" }); return null }
  const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
  return { agent, repo, worktreePath }
}

export const filesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/agents/:id/files", { schema: { params: idParamsSchema } }, listFiles)
  app.get("/api/agents/:id/files/diff", {
    schema: { params: idParamsSchema, querystring: pathQuerySchema },
  }, getFileDiff)
  app.get("/api/agents/:id/files/tree", { schema: { params: idParamsSchema } }, getFileTreeHandler)
  app.get("/api/agents/:id/files/content", {
    schema: { params: idParamsSchema, querystring: pathQuerySchema },
  }, getContent)
  app.get("/api/agents/:id/files/base-content", {
    schema: { params: idParamsSchema, querystring: pathQuerySchema },
  }, getBaseContent)
  app.put("/api/agents/:id/files/content", {
    schema: { params: idParamsSchema, body: saveFileContentBodySchema },
  }, saveContent)
  app.get("/api/agents/:id/files/diffs", { schema: { params: idParamsSchema } }, batchFileDiffs)
  app.post("/api/agents/:id/files/refresh", { schema: { params: idParamsSchema } }, refreshFiles)
}

// GET /api/agents/:id/files — list file changes from DB
async function listFiles(
  req: { params: { id: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
  if (!agent) return reply.code(404).send({ error: "Not found" })
  return db.select().from(fileChanges).where(eq(fileChanges.agentId, req.params.id)).all()
}

// GET /api/agents/:id/files/diff?path=src/foo.ts
async function getFileDiff(
  req: { params: { id: string }; query: { path?: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const filePath = req.query.path ?? ""
  const diff = await getDiff(ctx.worktreePath, filePath, ctx.agent.baseBranch ?? ctx.repo.branchFrom)
  reply.header("Content-Type", "text/plain")
  return diff
}

// GET /api/agents/:id/files/tree
async function getFileTreeHandler(
  req: { params: { id: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  if (!existsSync(ctx.worktreePath)) return reply.code(404).send({ error: "Worktree does not exist on disk" })
  return getFileTree(ctx.worktreePath)
}

// GET /api/agents/:id/files/content
async function getContent(
  req: { params: { id: string }; query: { path?: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const filePath = req.query.path ?? ""
  if (!filePath) return reply.code(400).send({ error: "path query parameter required" })
  const content = await getFileContent(ctx.worktreePath, filePath)
  reply.header("Content-Type", "text/plain")
  return content
}

// GET /api/agents/:id/files/base-content
async function getBaseContent(
  req: { params: { id: string }; query: { path?: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const filePath = req.query.path ?? ""
  if (!filePath) return reply.code(400).send({ error: "path query parameter required" })
  const content = await getBaseFileContent(ctx.worktreePath, filePath, ctx.agent.baseBranch ?? ctx.repo.branchFrom)
  reply.header("Content-Type", "text/plain")
  return content
}

// PUT /api/agents/:id/files/content
async function saveContent(
  req: { params: { id: string }; body: z.infer<typeof saveFileContentBodySchema> },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const { path: filePath, content } = req.body
  await saveFileContent(ctx.worktreePath, filePath, content)
  return { ok: true }
}

// GET /api/agents/:id/files/diffs — batch fetch all diffs + file contents for changed files
async function batchFileDiffs(
  req: { params: { id: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const branchFrom = ctx.agent.baseBranch ?? ctx.repo.branchFrom
  const files = db.select().from(fileChanges).where(eq(fileChanges.agentId, req.params.id)).all()

  return Promise.all(files.map(async (f) => {
    try {
      const [diff, newContent, oldContent] = await Promise.all([
        getDiff(ctx.worktreePath, f.path, branchFrom),
        getFileContent(ctx.worktreePath, f.path).catch(() => ""),
        getBaseFileContent(ctx.worktreePath, f.path, branchFrom).catch(() => ""),
      ])
      return { path: f.path, additions: f.additions, deletions: f.deletions, diff, newContent, oldContent }
    } catch {
      return { path: f.path, additions: f.additions, deletions: f.deletions, diff: "", newContent: "", oldContent: "" }
    }
  }))
}

// POST /api/agents/:id/files/refresh — re-scan worktree and update DB
async function refreshFiles(
  req: { params: { id: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const files = await getFileChanges(ctx.worktreePath, ctx.agent.baseBranch ?? ctx.repo.branchFrom)

  // Replace file changes in DB
  await db.delete(fileChanges).where(eq(fileChanges.agentId, req.params.id))
  for (const f of files) {
    await db.insert(fileChanges).values({
      id: `${req.params.id}-${f.path.replace(/[/\\]/g, "-")}`,
      agentId: req.params.id,
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    })
  }
  return files
}
