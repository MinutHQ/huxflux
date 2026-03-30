import type { FastifyInstance } from "fastify"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

interface RepoResult {
  name: string
  path: string
}

async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(dirPath, ".git"))
    return true
  } catch {
    return false
  }
}

async function findGitRepos(rootPath: string, maxDepth: number, results: RepoResult[]): Promise<void> {
  if (maxDepth < 0) return
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Skip hidden dirs and common non-repo dirs
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".git") continue
    const fullPath = path.join(rootPath, entry.name)
    if (await isGitRepo(fullPath)) {
      results.push({ name: entry.name, path: fullPath })
    } else {
      await findGitRepos(fullPath, maxDepth - 1, results)
    }
  }
}

export async function fsRoutes(app: FastifyInstance) {
  // GET /api/fs/repos?q= — find git repos on the server filesystem
  app.get<{ Querystring: { q?: string; root?: string } }>("/api/fs/repos", async (req) => {
    const q = (req.query.q ?? "").toLowerCase().trim()
    const root = req.query.root ?? os.homedir()

    const results: RepoResult[] = []
    await findGitRepos(root, 3, results)

    if (!q) return results.slice(0, 50)
    return results
      .filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q))
      .slice(0, 50)
  })

  // GET /api/fs/browse?path= — list subdirectories at a given path
  app.get<{ Querystring: { path?: string } }>("/api/fs/browse", async (req) => {
    const dirPath = req.query.path
      ? req.query.path.replace(/^~/, os.homedir())
      : os.homedir()

    let entries: Awaited<ReturnType<typeof fs.readdir>>
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return { path: dirPath, dirs: [] }
    }

    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => ({ name: e.name, path: path.join(dirPath, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return { path: dirPath, dirs }
  })
}
