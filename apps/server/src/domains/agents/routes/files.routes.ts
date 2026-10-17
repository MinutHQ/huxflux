import type { FastifyReply } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { existsSync } from "node:fs"
import { eq } from "drizzle-orm"
import { saveFileContentBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, fileChanges, repos } from "../../../db/schema.js"
import { getFileChanges, getDiff, getFileTree, getFileContent, saveFileContent, getBaseFileContent } from "../../git/worktrees.js"
import { resolveDiffBase, type DiffBase } from "../../git/worktrees.js"
import { getDiffBundle } from "../../git/diffBundle.js"
import {
  PathOutsideWorktreeError, listDirectory, listAllFilePaths, readWorktreeFile, searchFileContents,
} from "../../git/files.js"
import { contentDisposition, openRawWorktreeFile } from "../../git/rawFile.js"
import * as path from "node:path"

const idParamsSchema = z.object({ id: z.string() })
const diffBaseSchema = z.enum(["branch", "uncommitted"]).optional()
const pathQuerySchema = z.object({ path: z.string().optional(), base: diffBaseSchema })
const baseQuerySchema = z.object({ base: diffBaseSchema })
const readQuerySchema = z.object({ path: z.string().min(1), force: z.enum(["0", "1"]).optional() })
const rawQuerySchema = z.object({ path: z.string().min(1), download: z.enum(["0", "1"]).optional() })
const searchQuerySchema = z.object({ q: z.string() })

/** Map containment and missing-file errors to 400/404; rethrow everything else. */
function sendFsError(err: unknown, reply: FastifyReply): unknown {
  if (err instanceof PathOutsideWorktreeError) return reply.code(400).send({ error: err.message })
  if ((err as { code?: string }).code === "ENOENT") return reply.code(404).send({ error: "Not found" })
  throw err
}

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
  app.get("/api/agents/:id/files/diffs", {
    schema: { params: idParamsSchema, querystring: baseQuerySchema },
  }, batchFileDiffs)
  app.post("/api/agents/:id/files/refresh", { schema: { params: idParamsSchema } }, refreshFiles)
  app.get("/api/agents/:id/files/list", {
    schema: { params: idParamsSchema, querystring: pathQuerySchema },
  }, listDirectoryHandler)
  app.get("/api/agents/:id/files/paths", { schema: { params: idParamsSchema } }, listPathsHandler)
  app.get("/api/agents/:id/files/search", {
    schema: { params: idParamsSchema, querystring: searchQuerySchema },
  }, searchHandler)
  app.get("/api/agents/:id/files/read", {
    schema: { params: idParamsSchema, querystring: readQuerySchema },
  }, readHandler)
  app.get("/api/agents/:id/files/raw", {
    schema: { params: idParamsSchema, querystring: rawQuerySchema },
  }, rawHandler)
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
  req: { params: { id: string }; query: { path?: string; base?: DiffBase } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const filePath = req.query.path ?? ""
  const diff = await getDiff(ctx.worktreePath, filePath, ctx.agent.baseBranch ?? ctx.repo.branchFrom, req.query.base)
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
  req: { params: { id: string }; query: { path?: string; base?: DiffBase } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const filePath = req.query.path ?? ""
  if (!filePath) return reply.code(400).send({ error: "path query parameter required" })
  const content = await getBaseFileContent(ctx.worktreePath, filePath, ctx.agent.baseBranch ?? ctx.repo.branchFrom, req.query.base)
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
  try {
    await saveFileContent(ctx.worktreePath, filePath, content)
  } catch (err) {
    return sendFsError(err, reply)
  }
  return { ok: true }
}

// GET /api/agents/:id/files/diffs — batch fetch all diffs + file contents for changed files
async function batchFileDiffs(
  req: { params: { id: string }; query: { base?: DiffBase } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  const branchFrom = ctx.agent.baseBranch ?? ctx.repo.branchFrom
  const mode = req.query.base ?? "branch"
  // The DB rows track the branch-base view; the uncommitted view is cheap enough to scan live.
  const files = mode === "branch"
    ? db.select().from(fileChanges).where(eq(fileChanges.agentId, req.params.id)).all()
    : await getFileChanges(ctx.worktreePath, branchFrom, "uncommitted")

  const base = await resolveDiffBase(ctx.worktreePath, branchFrom, mode)
  const bundles = await getDiffBundle(ctx.worktreePath, base, files.map((f) => f.path))
  return files.map((f, i) => ({ additions: f.additions, deletions: f.deletions, ...bundles[i], path: f.path }))
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

// GET /api/agents/:id/files/list?path=dir — one directory level, ignored entries flagged
async function listDirectoryHandler(
  req: { params: { id: string }; query: { path?: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  try {
    return await listDirectory(ctx.worktreePath, req.query.path ?? "")
  } catch (err) {
    return sendFsError(err, reply)
  }
}

// GET /api/agents/:id/files/paths — flat list of non-ignored files for the name filter
async function listPathsHandler(
  req: { params: { id: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  return listAllFilePaths(ctx.worktreePath)
}

// GET /api/agents/:id/files/search?q= — content search across non-ignored files
async function searchHandler(
  req: { params: { id: string }; query: { q: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  return searchFileContents(ctx.worktreePath, req.query.q)
}

// GET /api/agents/:id/files/read?path=&force=1 — content plus binary / size flags
async function readHandler(
  req: { params: { id: string }; query: { path: string; force?: "0" | "1" } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  try {
    return await readWorktreeFile(ctx.worktreePath, req.query.path, req.query.force === "1")
  } catch (err) {
    return sendFsError(err, reply)
  }
}

// GET /api/agents/:id/files/raw?path=&download=1 — raw bytes for media previews and downloads.
// Loaded via `<img>`/`<video>`/links, so the token rides in the query string. Range is supported
// so video and audio can seek.
async function rawHandler(
  req: { params: { id: string }; query: { path: string; download?: "0" | "1" }; headers: { range?: string } },
  reply: FastifyReply,
): Promise<unknown> {
  const ctx = resolveAgentWorktree(req.params.id, reply)
  if (!ctx) return
  try {
    const file = await openRawWorktreeFile(ctx.worktreePath, req.query.path, req.headers.range)
    reply
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "private, no-cache")
      .header("X-Content-Type-Options", "nosniff")
      // Worktree files are agent-written; never let one run as a page on the server's origin.
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      // The URL carries the auth token; never forward it as a referrer.
      .header("Referrer-Policy", "no-referrer")
      .header("Content-Disposition", contentDisposition(req.query.download === "1" ? "attachment" : "inline", req.query.path))
    if (file.range === "unsatisfiable") {
      return reply.code(416).header("Content-Range", `bytes */${file.size}`).send()
    }
    reply.header("Content-Type", file.contentType)
    if (file.range) {
      reply.code(206)
        .header("Content-Range", `bytes ${file.range.start}-${file.range.end}/${file.size}`)
        .header("Content-Length", file.range.end - file.range.start + 1)
    } else {
      reply.header("Content-Length", file.size)
    }
    return reply.send(file.stream)
  } catch (err) {
    return sendFsError(err, reply)
  }
}
