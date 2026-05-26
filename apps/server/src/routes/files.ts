import type { FastifyInstance } from "fastify"
import { existsSync, lstatSync, readdirSync } from "node:fs"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, fileChanges, repos } from "../db/schema.js"
import { getFileChanges, getDiff, getFileTree, getFileContent, saveFileContent, getBaseFileContent, type FileTreeEntry } from "../git/worktrees.js"
import * as path from "node:path"

const FS_IGNORE = new Set([".git", "node_modules", ".next", "dist", "build", ".cache", ".turbo", "__pycache__", ".venv", "venv", ".tox", ".mypy_cache"])

// Resolve `subPath` relative to `rootPath` and verify the result is inside the
// root (or equal to it). Returns `null` on traversal attempts — including
// symlinks that escape — so callers can 400 the request.
function safeJoin(rootPath: string, subPath: string): string | null {
  const cleaned = subPath.replace(/^\/+|\/+$/g, "")
  const resolved = path.resolve(rootPath, cleaned)
  const rootResolved = path.resolve(rootPath)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) return null
  return resolved
}

// Shallow read of a single directory under a folder-type repo. Directories are
// returned with a trailing slash so the client tree can treat them as explicit
// folders (and show them as expandable even before their children are loaded).
// Symlinks are skipped — they can point outside the root and bypass the
// caller's containment check.
function listFolderDir(rootPath: string, subPath: string): FileTreeEntry[] {
  const dirAbs = safeJoin(rootPath, subPath)
  if (!dirAbs) return []
  let entries: string[]
  try { entries = readdirSync(dirAbs) } catch { return [] }
  const results: FileTreeEntry[] = []
  for (const entry of entries) {
    if (FS_IGNORE.has(entry) || entry.startsWith(".huxflux")) continue
    const rel = subPath ? `${subPath.replace(/\/+$/, "")}/${entry}` : entry
    const full = path.join(dirAbs, entry)
    try {
      const st = lstatSync(full)
      if (st.isSymbolicLink()) continue
      const isDir = st.isDirectory()
      results.push({
        name: entry,
        path: isDir ? `${rel}/` : rel,
        type: isDir ? "directory" : "file",
      })
    } catch { /* permission error or dangling symlink */ }
  }
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return results
}

export async function filesRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/files — list file changes from DB
  app.get<{ Params: { id: string } }>("/api/agents/:id/files", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })

    return db.select().from(fileChanges).where(eq(fileChanges.agentId, req.params.id)).all()
  })

  // GET /api/agents/:id/files/diff?path=src/foo.ts — unified diff from git
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/agents/:id/files/diff",
    async (req, reply) => {
      const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })
      if (!agent.repoId) return reply.code(400).send({ error: "Agent has no linked repo" })

      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (!repo) return reply.code(404).send({ error: "Repo not found" })

      if (repo.type === "folder") { reply.header("Content-Type", "text/plain"); return "" }
      const filePath = req.query.path ?? ""
      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      if (filePath && !safeJoin(worktreePath, filePath)) return reply.code(400).send({ error: "Invalid path" })
      const diff = await getDiff(worktreePath, filePath, agent.baseBranch ?? repo.branchFrom)
      reply.header("Content-Type", "text/plain")
      return diff
    }
  )

  // GET /api/agents/:id/files/tree — list all files in worktree as a tree.
  // For folder repos: returns immediate children of `?path=<dir>` (or root if
  // omitted). Subdirectories are returned as entries with trailing-slash paths
  // and no `children` so the client can fetch them lazily on expansion.
  // For git repos: returns the full tracked+untracked tree as before.
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/agents/:id/files/tree",
    async (req, reply) => {
      const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })
      if (!agent.repoId) return reply.code(400).send({ error: "Agent has no linked repo" })

      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (!repo) return reply.code(404).send({ error: "Repo not found" })

      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      if (!existsSync(worktreePath)) return reply.code(404).send({ error: "Worktree does not exist on disk" })
      if (repo.type === "folder") {
        const sub = (req.query.path ?? "").replace(/^\/+|\/+$/g, "")
        if (sub && !safeJoin(worktreePath, sub)) return reply.code(400).send({ error: "Invalid path" })
        return listFolderDir(worktreePath, sub)
      }
      return getFileTree(worktreePath)
    }
  )

  // GET /api/agents/:id/files/content?path=src/foo.ts — raw file content
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/agents/:id/files/content",
    async (req, reply) => {
      const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })
      if (!agent.repoId) return reply.code(400).send({ error: "Agent has no linked repo" })

      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (!repo) return reply.code(404).send({ error: "Repo not found" })

      const filePath = req.query.path ?? ""
      if (!filePath) return reply.code(400).send({ error: "path query parameter required" })

      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      if (!safeJoin(worktreePath, filePath)) return reply.code(400).send({ error: "Invalid path" })
      const content = await getFileContent(worktreePath, filePath)
      reply.header("Content-Type", "text/plain")
      return content
    }
  )

  // GET /api/agents/:id/files/base-content?path=src/foo.ts — file content at merge-base
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/agents/:id/files/base-content",
    async (req, reply) => {
      const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })
      if (!agent.repoId) return reply.code(400).send({ error: "Agent has no linked repo" })

      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (!repo) return reply.code(404).send({ error: "Repo not found" })

      const filePath = req.query.path ?? ""
      if (!filePath) return reply.code(400).send({ error: "path query parameter required" })

      if (repo.type === "folder") { reply.header("Content-Type", "text/plain"); return "" }
      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      if (!safeJoin(worktreePath, filePath)) return reply.code(400).send({ error: "Invalid path" })
      const content = await getBaseFileContent(worktreePath, filePath, agent.baseBranch ?? repo.branchFrom)
      reply.header("Content-Type", "text/plain")
      return content
    }
  )

  // PUT /api/agents/:id/files/content — save file content
  app.put<{ Params: { id: string }; Body: { path: string; content: string } }>(
    "/api/agents/:id/files/content",
    async (req, reply) => {
      const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
      if (!agent) return reply.code(404).send({ error: "Not found" })
      if (!agent.repoId) return reply.code(400).send({ error: "Agent has no linked repo" })

      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
      if (!repo) return reply.code(404).send({ error: "Repo not found" })

      const { path: filePath, content } = req.body
      if (!filePath) return reply.code(400).send({ error: "path is required" })

      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      if (!safeJoin(worktreePath, filePath)) return reply.code(400).send({ error: "Invalid path" })
      await saveFileContent(worktreePath, filePath, content)
      return { ok: true }
    }
  )

  // GET /api/agents/:id/files/diffs — batch fetch all diffs + file contents for changed files
  app.get<{ Params: { id: string } }>("/api/agents/:id/files/diffs", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.repoId) return reply.code(400).send({ error: "Agent has no linked repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    if (repo.type === "folder") return []

    const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
    const branchFrom = agent.baseBranch ?? repo.branchFrom
    const files = db.select().from(fileChanges).where(eq(fileChanges.agentId, req.params.id)).all()

    const results = await Promise.all(files.map(async (f) => {
      try {
        const [diff, newContent, oldContent] = await Promise.all([
          getDiff(worktreePath, f.path, branchFrom),
          getFileContent(worktreePath, f.path).catch(() => ""),
          getBaseFileContent(worktreePath, f.path, branchFrom).catch(() => ""),
        ])
        return { path: f.path, additions: f.additions, deletions: f.deletions, diff, newContent, oldContent }
      } catch {
        return { path: f.path, additions: f.additions, deletions: f.deletions, diff: "", newContent: "", oldContent: "" }
      }
    }))

    return results
  })

  // POST /api/agents/:id/files/refresh — re-scan worktree and update DB
  app.post<{ Params: { id: string } }>("/api/agents/:id/files/refresh", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    if (repo.type === "folder") return []
    const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
    const files = await getFileChanges(worktreePath, agent.baseBranch ?? repo.branchFrom)

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
  })
}
