import type { FastifyInstance, FastifyBaseLogger, RawServerDefault } from "fastify"
import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod"
import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { askBodySchema, answerBodySchema, openInBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, repos } from "../../../db/schema.js"
import { agentsWs } from "../agents.ws.js"
import { getAvailableProviders } from "../../providers/registry.js"
import { getClaudeBin } from "../../agent-runner/agent-runner.service.js"
import { setPendingQuestion, getPendingToolUseId, clearPendingQuestion } from "../../../askStore.js"
import * as path from "node:path"
import { existsSync } from "node:fs"
import * as fsP from "node:fs/promises"
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
  registerContext(app)
  registerProviders(app)
}

function registerAskAnswer(app: ZodApp): void {
  // AskUserQuestion is detected from the streaming output in the runner and
  // emitted to the UI directly. The hook script waits for an answer file
  // written by /answer; no curl or network calls in the hook.

  // POST /api/agents/:id/ask — backwards compat with legacy curl-based hooks
  app.post("/api/agents/:id/ask", {
    schema: { params: idParamsSchema, body: askBodySchema },
  }, async (req) => {
    const { id } = req.params
    const { tool_input, tool_use_id } = req.body
    const questions = tool_input?.questions ?? []

    app.log.info(`[ask] Agent ${id} AskUserQuestion (legacy hook): ${questions.length} questions, tool_use_id=${tool_use_id}`)

    setPendingQuestion(id, tool_use_id)
    agentsWs.askQuestion(id, tool_use_id, questions)

    // Wait for the answer file (written by /answer) — no in-memory promise map.
    const answerFile = `/tmp/huxflux-ask-${tool_use_id}`
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      try {
        const data = await fsP.readFile(answerFile, "utf8")
        await fsP.unlink(answerFile)
        return JSON.parse(data) as unknown
      } catch { /* file doesn't exist yet */ }
      await new Promise((r) => setTimeout(r, 200))
    }
    return {}
  })

  // POST /api/agents/:id/answer — called by frontend when user answers a question
  app.post(
    "/api/agents/:id/answer",
    { schema: { params: idParamsSchema, body: answerBodySchema } },
    async (req, reply) => {
      const { id } = req.params
      const { answers, toolUseId } = req.body

      const effectiveToolUseId = toolUseId ?? getPendingToolUseId(id)
      if (!effectiveToolUseId) return reply.code(404).send({ error: "No pending question" })

      clearPendingQuestion(id)

      // Write the answer file the hook script is polling for.
      const answerFile = `/tmp/huxflux-ask-${effectiveToolUseId}`
      const hookResponse = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: { answers },
        },
      })
      await fsP.writeFile(answerFile, hookResponse)

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

function registerContext(app: ZodApp): void {
  // GET /api/agents/:id/context — get context window usage from Claude
  app.get("/api/agents/:id/context", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.sessionId) return reply.code(200).send({ used: 0, limit: 0, percent: 0, model: agent.model })

    const claudeBin = getClaudeBin()

    try {
      const result = await runClaudeContextProbe(claudeBin, agent.sessionId)
      return parseContextResult(result, agent.model)
    } catch (err) {
      return reply.code(500).send({ error: `Failed to get context: ${(err as Error).message}` })
    }
  })
}

function runClaudeContextProbe(claudeBin: string, sessionId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let output = ""
    const proc = spawn(claudeBin, [
      "--resume", sessionId,
      "-p", "/context",
      "--output-format", "text",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME ?? ""}/.npm-global/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}`,
      },
      timeout: 15_000,
    })
    proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString() })
    proc.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`exit ${code}`)))
    proc.on("error", reject)
  })
}

interface ContextResult {
  used: number
  limit: number
  percent: number
  model: string
  raw?: string
  categories?: Array<{ name: string; tokens: number; percent: number }>
}

function parseContextResult(result: string, fallbackModel: string): ContextResult {
  // Parse "Tokens: 190k / 1m (19%)" or "Tokens: 18.2k / 1000k (2%)"
  const tokensMatch = result.match(/\*\*Tokens:\*\*\s*([\d.]+)([km]?)\s*\/\s*([\d.]+)([km]?)\s*\((\d+)%\)/i)
  if (!tokensMatch) {
    return { used: 0, limit: 0, percent: 0, model: fallbackModel, raw: result }
  }

  const used = parseTokenCount(tokensMatch[1], tokensMatch[2].toLowerCase())
  const limit = parseTokenCount(tokensMatch[3], tokensMatch[4].toLowerCase())
  const percent = parseInt(tokensMatch[5], 10)

  // Parse model from "Model: claude-opus-4-6"
  const modelMatch = result.match(/\*\*Model:\*\*\s*(\S+)/)

  // Parse category breakdown
  const categories: Array<{ name: string; tokens: number; percent: number }> = []
  const catRegex = /\|\s*([^|]+?)\s*\|\s*([\d.,]+)([km]?)\s*(?:tokens)?\s*\|\s*([\d.]+)%\s*\|/gi
  let m
  while ((m = catRegex.exec(result)) !== null) {
    const name = m[1].trim()
    if (name === "Category" || name.startsWith("--")) continue
    categories.push({
      name,
      tokens: parseTokenCount(m[2].replace(",", ""), m[3].toLowerCase()),
      percent: parseFloat(m[4]),
    })
  }

  return { used, limit, percent, model: modelMatch?.[1] ?? fallbackModel, categories }
}

function parseTokenCount(num: string, suffix: string): number {
  const n = parseFloat(num)
  if (suffix === "k") return Math.round(n * 1000)
  if (suffix === "m") return Math.round(n * 1_000_000)
  return Math.round(n)
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
