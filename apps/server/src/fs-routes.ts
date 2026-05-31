import type { FastifyInstance } from "fastify"
import * as fs from "node:fs/promises"
import type { Dirent } from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

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

const SKIP_DIRS = new Set([
  // System / OS
  "Library", "System", "Applications", "Volumes", "private", "proc", "sys", "dev", "etc", "usr", "var", "bin", "sbin", "opt",
  // Package managers & caches
  "node_modules", ".npm", ".yarn", ".pnpm-store", ".cache", ".gradle", ".m2", "vendor",
  // Build output
  "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "target", "__pycache__", ".pytest_cache",
  // Virtual envs
  ".venv", "venv", "env", ".env", "virtualenv",
  // IDE / tooling internals
  ".git", ".idea", ".vscode", ".vs",
  // macOS specifics
  "Trash", ".Trash",
])

async function findGitRepos(rootPath: string, maxDepth: number, results: RepoResult[]): Promise<void> {
  if (maxDepth < 0) return
  let entries: Dirent[]
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true, encoding: "utf8" })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name) || entry.name === "conductor") continue
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

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true, encoding: "utf8" })
    } catch {
      return { path: dirPath, dirs: [] }
    }

    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => ({ name: e.name, path: path.join(dirPath, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return { path: dirPath, dirs }
  })

  // GET /api/fs/default-branch?path= — detect default branch for a local git repo (remote or local-only)
  app.get<{ Querystring: { path?: string } }>("/api/fs/default-branch", async (req, reply) => {
    const repoPath = req.query.path
    if (!repoPath) return reply.code(400).send({ error: "path required" })

    // 1. Remote HEAD
    try {
      const { stdout } = await execFileAsync("git", ["-C", repoPath, "symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { timeout: 5000 })
      if (stdout.trim()) return { branch: stdout.trim() }
    } catch { /* no remote HEAD */ }

    // 2. Known remote branch names
    for (const branch of ["origin/main", "origin/master"]) {
      try {
        await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", branch], { timeout: 5000 })
        return { branch }
      } catch { /* try next */ }
    }

    // 3. Local HEAD branch (local-only repo)
    try {
      const { stdout } = await execFileAsync("git", ["-C", repoPath, "symbolic-ref", "--short", "HEAD"], { timeout: 5000 })
      if (stdout.trim()) return { branch: stdout.trim() }
    } catch { /* detached HEAD */ }

    return { branch: "main" }
  })
}
