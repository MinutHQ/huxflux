import type { FastifyInstance, FastifyBaseLogger, RawServerDefault } from "fastify"
import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod"
import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { answerBodySchema, openInBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, repos } from "../../../db/schema.js"
import { getAvailableProviders } from "../../providers/registry.js"
import { answerPendingQuestion } from "../../agent-runner/agent-runner.service.js"
import { getPendingQuestion } from "../../../askStore.js"
import * as path from "node:path"
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"

// Fastify instance shape that carries the Zod type provider so the `schema`
// option on route declarations gets full inference for `req.body` /
// `req.params` / `req.query`. Used by the per-feature helpers below.
type ZodApp = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>

const idParamsSchema = z.object({ id: z.string() })

export const agentsMiscRoutes: FastifyPluginAsyncZod = async (app) => {
  registerAskAnswer(app)
  registerOpenIn(app)
  registerWorktreePath(app)
  registerProviders(app)
}

function registerAskAnswer(app: ZodApp): void {
  // AskUserQuestion arrives as a `can_use_tool` control_request from the CLI;
  // the runner parks it in the ask store and notifies the UI over WS. This
  // endpoint completes the round trip by writing the allow control_response
  // (with the user's answers) to the running CLI's stdin.

  // POST /api/agents/:id/answer — called by frontend when user answers a question
  app.post(
    "/api/agents/:id/answer",
    { schema: { params: idParamsSchema, body: answerBodySchema } },
    async (req, reply) => {
      const { id } = req.params
      const { answers } = req.body

      if (!getPendingQuestion(id)) return reply.code(404).send({ error: "No pending question" })
      if (!answerPendingQuestion(id, answers)) {
        return reply.code(409).send({ error: "Agent is no longer running; the question expired" })
      }
      return { ok: true }
    },
  )
}

function registerOpenIn(app: ZodApp): void {
  // POST /api/agents/:id/open-in — open worktree in a local application
  app.post("/api/agents/:id/open-in", {
    schema: { params: idParamsSchema, body: openInBodySchema },
  }, async (req, reply) => {
    const { app: appName } = req.body
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
    if (!existsSync(worktreePath)) return reply.code(404).send({ error: "Worktree path does not exist on disk" })

    return launchExternalApp(appName, worktreePath, reply)
  })
}

interface ExternalApp {
  bundle: string
  cli?: string[]
}

async function launchExternalApp(
  appName: string,
  worktreePath: string,
  reply: import("fastify").FastifyReply,
): Promise<unknown> {
  // Map app keys to their bundle names and optional CLI launchers.
  // We always use osascript to activate after a short delay so the target app
  // steals focus from the browser (the click event otherwise keeps it in front).
  const apps: Record<string, ExternalApp> = {
    finder:   { bundle: "Finder" },
    vscode:   { bundle: "Visual Studio Code", cli: ["code", worktreePath] },
    cursor:   { bundle: "Cursor", cli: ["cursor", worktreePath] },
    iterm:    { bundle: "iTerm" },
    terminal: { bundle: "Terminal" },
    datagrip: { bundle: "DataGrip" },
  }

  const externalApp = apps[appName]
  if (!externalApp) return reply.code(400).send({ error: `Unknown app: ${appName}` })

  try {
    if (externalApp.cli) {
      const proc = spawn(externalApp.cli[0], externalApp.cli.slice(1), { detached: true, stdio: "ignore" })
      proc.unref()
      // Listen for spawn errors (e.g. command not found)
      await new Promise<void>((resolve, reject) => {
        proc.on("error", reject)
        // If no error fires within 500ms, assume spawn succeeded
        setTimeout(resolve, 500)
      })
    } else {
      spawn("open", ["-a", externalApp.bundle, worktreePath], { detached: true, stdio: "ignore" }).unref()
    }

    // Activate after a delay so the app window is ready
    setTimeout(() => {
      try {
        const script = `tell application "${externalApp.bundle}" to activate`
        spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" }).unref()
      } catch { /* non-critical */ }
    }, 600)
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === "ENOENT") {
      const cmd = externalApp.cli?.[0] ?? appName
      return reply.code(422).send({
        error: `"${cmd}" command not found. Open ${externalApp.bundle}, then install the shell command from the Command Palette (Shell Command: Install 'code' command in PATH).`,
      })
    }
    return reply.code(500).send({ error: `Failed to open ${appName}: ${(err as Error).message}` })
  }

  return { ok: true, worktreePath }
}

function registerWorktreePath(app: ZodApp): void {
  // GET /api/agents/:id/worktree-path — get the resolved worktree path
  app.get("/api/agents/:id/worktree-path", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent || !agent.repoId) return reply.code(404).send({ error: "Not found or no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
    return { path: worktreePath }
  })
}

function registerProviders(app: ZodApp): void {
  // GET /api/providers — list available CLI providers with capabilities and models
  app.get("/api/providers", async () => {
    return getAvailableProviders().map((p) => ({
      id: p.id,
      name: p.name,
      available: p.isAvailable(),
      capabilities: p.capabilities,
      models: p.getModels(),
    }))
  })
}
