import type { FastifyReply } from "fastify"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import { v4 as uuid } from "uuid"
import * as path from "node:path"
import * as fsSync from "node:fs"
import {
  createRepoBodySchema,
  updateRepoBodySchema,
  cloneRepoBodySchema,
  quickStartRepoBodySchema,
} from "@huxflux/shared"
import { db } from "../../db/index.js"
import { repos, agents } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import type { Repo } from "../../types.js"
import { listBranches } from "../pull-requests/misc.js"
import { getRemoteUrl } from "../git/worktrees.js"
import { config } from "../../config.js"
import {
  execFileAsync,
  resolvePath,
  detectBranchFrom,
  maintainReserveOnSetupScriptChange,
} from "./repos.service.js"

const idParamsSchema = z.object({ id: z.string() })

/**
 * Fastify plugin for the repos domain. Owns repo CRUD, branch discovery,
 * remote cloning, and the quick-start scaffolds (empty, Vite, TanStack Start).
 * Setup-script changes drive reserve-worktree maintenance via the service.
 */
export const reposPlugin: FastifyPluginAsyncZod = async (app) => {
  await app.register(reposRoutes)
}

const reposRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/repos", async () => db.select().from(repos).all())

  app.post("/api/repos", {
    schema: { body: createRepoBodySchema },
  }, async (req, reply) => {
    return createRepoHandler(req.body as Omit<Repo, "id" | "createdAt">, reply)
  })

  app.patch("/api/repos/:id", {
    schema: { params: idParamsSchema, body: updateRepoBodySchema },
  }, async (req, reply) => {
    return patchRepoHandler(req.params.id, req.body as Partial<Repo>, reply)
  })

  app.delete("/api/repos/:id", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    // Delete agents first — the FK constraint lacks ON DELETE CASCADE (SQLite can't alter it)
    db.delete(agents).where(eq(agents.repoId, req.params.id)).run()
    db.delete(repos).where(eq(repos.id, req.params.id)).run()
    reply.code(204).send()
  })

  app.get("/api/repos/:id/branches", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => branchesHandler(req.params.id, reply))

  app.post("/api/repos/clone", {
    schema: { body: cloneRepoBodySchema },
  }, async (req, reply) => {
    return cloneRepoHandler(req.body, reply)
  })

  app.post("/api/repos/quick-start", {
    schema: { body: quickStartRepoBodySchema },
  }, async (req, reply) => {
    return quickStartHandler(req.body, reply)
  })
}

async function createRepoHandler(body: Omit<Repo, "id" | "createdAt">, reply: FastifyReply): Promise<unknown> {
  const existing = db.select().from(repos).where(eq(repos.path, body.path)).get()
  if (existing) {
    reply.code(409)
    return { error: "A repository with this path is already registered" }
  }
  const now = new Date().toISOString()
  const id = uuid()
  await db.insert(repos).values({
    id,
    name: body.name,
    path: body.path,
    workspacesPath: body.workspacesPath ?? path.join(config.workspacesBase, body.name),
    branchFrom: body.branchFrom ?? "origin/main",
    branchPrefix: body.branchPrefix ?? null,
    remote: body.remote ?? "origin",
    previewUrl: body.previewUrl,
    setupScript: body.setupScript,
    runScript: body.runScript,
    createdAt: now,
  })
  reply.code(201)
  return db.select().from(repos).where(eq(repos.id, id)).get()
}

async function patchRepoHandler(id: string, body: Partial<Repo>, reply: FastifyReply): Promise<unknown> {
  const before = db.select().from(repos).where(eq(repos.id, id)).get()
  await db.update(repos).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.path !== undefined && { path: body.path }),
    ...(body.workspacesPath !== undefined && { workspacesPath: body.workspacesPath }),
    ...(body.branchFrom !== undefined && { branchFrom: body.branchFrom }),
    ...(body.branchPrefix !== undefined && { branchPrefix: body.branchPrefix }),
    ...(body.remote !== undefined && { remote: body.remote }),
    ...(body.previewUrl !== undefined && { previewUrl: body.previewUrl }),
    ...(body.setupScript !== undefined && { setupScript: body.setupScript }),
    ...(body.runScript !== undefined && { runScript: body.runScript }),
    ...(body.icon !== undefined && { icon: body.icon }),
  }).where(eq(repos.id, id))
  const updated = db.select().from(repos).where(eq(repos.id, id)).get()
  if (!updated) return reply.code(404).send({ error: "Not found" })

  // Keep the hidden reserve in sync with setupScript changes
  if (body.setupScript !== undefined && (before?.setupScript ?? null) !== (updated.setupScript ?? null)) {
    maintainReserveOnSetupScriptChange(id, updated.setupScript)
  }

  return updated
}

async function branchesHandler(id: string, reply: FastifyReply): Promise<unknown> {
  const repo = db.select().from(repos).where(eq(repos.id, id)).get()
  if (!repo) return reply.code(404).send({ error: "Not found" })
  const repoUrl = await getRemoteUrl(repo.path, repo.remote).catch(() => null)
  if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })
  const branches = await listBranches(repoUrl).catch(() => [] as string[])
  return branches
}

async function cloneRepoHandler(
  body: { url: string; location: string; name?: string },
  reply: FastifyReply,
): Promise<unknown> {
  const { url, location, name } = body
  if (!url?.trim()) return reply.code(400).send({ error: "url required" })
  if (!location?.trim()) return reply.code(400).send({ error: "location required" })

  const resolvedLocation = resolvePath(location.trim())
  const repoName = name?.trim() || url.split("/").pop()?.replace(/\.git$/, "") || "repo"

  const parentDir = path.dirname(resolvedLocation)
  if (!fsSync.existsSync(parentDir)) {
    return reply.code(400).send({ error: `Parent directory does not exist: ${parentDir}` })
  }
  if (fsSync.existsSync(resolvedLocation)) {
    return reply.code(400).send({ error: `Destination already exists: ${resolvedLocation}` })
  }

  try {
    await execFileAsync("git", ["clone", url.trim(), resolvedLocation], { timeout: 120_000 })
  } catch (err) {
    const msg = String((err as Error & { stderr?: string }).stderr ?? (err as Error).message ?? err)
    return reply.code(400).send({ error: `Clone failed: ${msg.split("\n")[0]}` })
  }

  const branchFrom = await detectBranchFrom(resolvedLocation)
  const id = uuid()
  const now = new Date().toISOString()
  db.insert(repos).values({
    id,
    name: repoName,
    path: resolvedLocation,
    workspacesPath: path.join(config.workspacesBase, repoName),
    branchFrom,
    branchPrefix: null,
    remote: "origin",
    createdAt: now,
  }).run()

  reply.code(201)
  return db.select().from(repos).where(eq(repos.id, id)).get()
}

async function quickStartHandler(
  body: { name: string; location: string; template: "empty" | "vite" | "tanstack-start" },
  reply: FastifyReply,
): Promise<unknown> {
  const { name, location, template } = body
  if (!name?.trim()) return reply.code(400).send({ error: "name required" })
  if (!location?.trim()) return reply.code(400).send({ error: "location required" })
  if (!["empty", "vite", "tanstack-start"].includes(template)) return reply.code(400).send({ error: "invalid template" })

  const resolvedParent = resolvePath(location.trim())
  const projectPath = path.join(resolvedParent, name.trim())

  if (!fsSync.existsSync(resolvedParent)) {
    return reply.code(400).send({ error: `Location does not exist: ${resolvedParent}` })
  }
  if (fsSync.existsSync(projectPath)) {
    return reply.code(400).send({ error: `Directory already exists: ${projectPath}` })
  }

  const scaffoldError = await runScaffold(template, name.trim(), resolvedParent, projectPath)
  if (scaffoldError) return reply.code(400).send({ error: scaffoldError })

  if (!fsSync.existsSync(projectPath)) {
    return reply.code(400).send({ error: "Scaffold completed but project directory not found" })
  }

  await maybeInitGitRepo(projectPath)
  return finalizeQuickStartRepo(name.trim(), projectPath, reply)
}

async function runScaffold(
  template: "empty" | "vite" | "tanstack-start",
  name: string,
  parent: string,
  projectPath: string,
): Promise<string | null> {
  try {
    if (template === "empty") {
      fsSync.mkdirSync(projectPath, { recursive: true })
    } else if (template === "vite") {
      await execFileAsync("npm", ["create", "vite@latest", name, "--", "--template", "react-ts"], {
        cwd: parent,
        timeout: 120_000,
        env: { ...process.env, npm_config_yes: "true" },
      })
    } else {
      await execFileAsync("npx", ["create-tsrouter-app@latest", name, "--framework", "react", "--target", "file-router", "--package-manager", "npm"], {
        cwd: parent,
        timeout: 120_000,
        env: { ...process.env, npm_config_yes: "true" },
      })
    }
  } catch (err) {
    const msg = String((err as Error & { stderr?: string }).stderr ?? (err as Error).message ?? err)
    return `Scaffold failed: ${msg.split("\n")[0]}`
  }
  return null
}

async function maybeInitGitRepo(projectPath: string): Promise<void> {
  if (fsSync.existsSync(path.join(projectPath, ".git"))) return
  try {
    await execFileAsync("git", ["init"], { cwd: projectPath, timeout: 5000 })
    await execFileAsync("git", ["add", "-A"], { cwd: projectPath, timeout: 5000 })
    await execFileAsync("git", ["commit", "-m", "Initial commit"], {
      cwd: projectPath,
      timeout: 10_000,
      env: { ...process.env, GIT_AUTHOR_NAME: "Hive", GIT_AUTHOR_EMAIL: "hive@local", GIT_COMMITTER_NAME: "Hive", GIT_COMMITTER_EMAIL: "hive@local" },
    })
  } catch { /* non-fatal */ }
}

async function finalizeQuickStartRepo(name: string, projectPath: string, reply: FastifyReply): Promise<unknown> {
  const id = uuid()
  const now = new Date().toISOString()
  db.insert(repos).values({
    id,
    name,
    path: projectPath,
    workspacesPath: path.join(config.workspacesBase, name),
    branchFrom: "main",
    branchPrefix: null,
    remote: "origin",
    createdAt: now,
  }).run()

  reply.code(201)
  return db.select().from(repos).where(eq(repos.id, id)).get()
}
