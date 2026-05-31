import type { FastifyInstance, FastifyReply, FastifyBaseLogger, RawServerDefault } from "fastify"
import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod"
import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod/v4"
import { eq } from "drizzle-orm"
import { createPRBodySchema, mergePRBodySchema } from "@huxflux/shared"
import { db } from "../../../db/index.js"
import { agents, repos } from "../../../db/schema.js"
import { getRemoteUrl } from "../../git/worktrees.js"
import { agentsWs } from "../../agents/agents.ws.js"
import { getPRDetails } from "../service/prDetails.js"
import { getPRStatus, prStatusToAgentStatus } from "../service/prStatus.js"
import { createPR, markPRReady, mergePR, rerequestReview } from "../service/prActions.js"
import type { AgentSummary, PRStatus } from "../../../types.js"

// Typed instance shape that carries the Zod type provider into the per-route
// helpers below, so they see typed `req.body`/`req.params` from the `schema`
// declaration.
type ZodApp = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>

const idParamsSchema = z.object({ id: z.string() })

type Agent = typeof agents.$inferSelect
type Repo = typeof repos.$inferSelect

/**
 * Common preamble for every `/api/agents/:id/pr/*` route: load the agent
 * row, optionally require a PR number, load the repo row, and resolve the
 * remote URL. Returns null after responding 4xx if any step fails so the
 * caller can early-return without further bookkeeping.
 */
async function loadAgentWithRepo(
  agentId: string,
  reply: FastifyReply,
  requirePr: boolean,
): Promise<{ agent: Agent; repo: Repo; repoUrl: string } | null> {
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()
  if (!agent) { reply.code(404).send({ error: "Not found" }); return null }
  if (requirePr && !agent.prNumber) { reply.code(400).send({ error: "No PR on this agent" }); return null }
  if (!agent.repoId) { reply.code(400).send({ error: "Agent has no repo" }); return null }

  const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
  if (!repo) { reply.code(404).send({ error: "Repo not found" }); return null }

  const repoUrl = await getRemoteUrl(repo.path, repo.remote)
  if (!repoUrl) { reply.code(400).send({ error: "Cannot resolve remote URL" }); return null }
  return { agent, repo, repoUrl }
}

async function broadcastAgentUpdate(agentId: string, prStatus: PRStatus): Promise<void> {
  const updated = db.select().from(agents).where(eq(agents.id, agentId)).get()
  agentsWs.agentUpdated({ ...updated, prStatus } as unknown as AgentSummary)
}

function registerDetailsRoute(app: ZodApp): void {
  // GET /api/agents/:id/pr/details — full PR info with reviews + checks
  app.get("/api/agents/:id/pr/details", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const ctx = await loadAgentWithRepo(req.params.id, reply, true)
    if (!ctx || !ctx.agent.prNumber) return
    return getPRDetails(ctx.repoUrl, ctx.agent.prNumber)
  })
}

function registerCreateRoute(app: ZodApp): void {
  // POST /api/agents/:id/pr — create a PR for the agent's branch
  app.post(
    "/api/agents/:id/pr",
    { schema: { params: idParamsSchema, body: createPRBodySchema } },
    async (req, reply) => {
      const ctx = await loadAgentWithRepo(req.params.id, reply, false)
      if (!ctx) return
      const body = req.body
      const baseBranch = (ctx.agent.baseBranch ?? ctx.repo.branchFrom).replace(/^origin\//, "")

      const { url, number } = await createPR({
        repoUrl: ctx.repoUrl,
        branch: ctx.agent.branch,
        baseBranch,
        title: body.title,
        body: body.body,
        draft: body.draft ?? false,
      })

      const pr = await getPRStatus(ctx.repoUrl, number)
      const newStatus = prStatusToAgentStatus(pr)
      const now = new Date().toISOString()

      await db.update(agents)
        .set({ pr: url, prNumber: number, prStatus: JSON.stringify(pr), status: newStatus, updatedAt: now })
        .where(eq(agents.id, ctx.agent.id))

      await broadcastAgentUpdate(ctx.agent.id, pr)
      return pr
    },
  )
}

function registerReadyRoute(app: ZodApp): void {
  // PUT /api/agents/:id/pr/ready — mark draft PR as ready for review
  app.put("/api/agents/:id/pr/ready", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const ctx = await loadAgentWithRepo(req.params.id, reply, true)
    if (!ctx || !ctx.agent.prNumber) return

    await markPRReady(ctx.repoUrl, ctx.agent.prNumber)

    const pr = await getPRStatus(ctx.repoUrl, ctx.agent.prNumber)
    const now = new Date().toISOString()

    await db.update(agents)
      .set({ prStatus: JSON.stringify(pr), status: "in-review", updatedAt: now })
      .where(eq(agents.id, ctx.agent.id))

    await broadcastAgentUpdate(ctx.agent.id, pr)
    return pr
  })
}

function registerRerequestRoute(app: ZodApp): void {
  // POST /api/agents/:id/pr/rerequest-review — re-request review from change requesters.
  // Inline guards (instead of loadAgentWithRepo) preserve the per-condition
  // debug logs the original handler emitted before short-circuiting.
  app.post("/api/agents/:id/pr/rerequest-review", {
    schema: { params: idParamsSchema },
  }, async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.prNumber) { console.info("[rerequest] no prNumber on agent", agent.id); return reply.code(400).send({ error: "No PR on this agent" }) }
    if (!agent.repoId) { console.info("[rerequest] no repoId on agent", agent.id); return reply.code(400).send({ error: "Agent has no repo" }) }

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const repoUrl = await getRemoteUrl(repo.path, repo.remote)
    console.info("[rerequest] repoUrl=", repoUrl, "prNumber=", agent.prNumber)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })

    try {
      await rerequestReview(repoUrl, agent.prNumber)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[rerequest] error:", msg)
      return reply.code(400).send({ error: msg })
    }

    const pr = await getPRStatus(repoUrl, agent.prNumber)
    const now = new Date().toISOString()

    await db.update(agents)
      .set({ prStatus: JSON.stringify(pr), updatedAt: now })
      .where(eq(agents.id, agent.id))

    await broadcastAgentUpdate(agent.id, pr)
    return pr
  })
}

function registerMergeRoute(app: ZodApp): void {
  // POST /api/agents/:id/pr/merge — merge the agent's PR
  app.post(
    "/api/agents/:id/pr/merge",
    { schema: { params: idParamsSchema, body: mergePRBodySchema.nullish() } },
    async (req, reply) => {
      const ctx = await loadAgentWithRepo(req.params.id, reply, true)
      if (!ctx || !ctx.agent.prNumber) return
      const body = req.body ?? {}

      try {
        await mergePR(ctx.repoUrl, ctx.agent.prNumber, body.method)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return reply.code(400).send({ error: message })
      }

      const pr = await getPRStatus(ctx.repoUrl, ctx.agent.prNumber)
      const now = new Date().toISOString()
      await db.update(agents)
        .set({ prStatus: JSON.stringify(pr), status: "done", updatedAt: now })
        .where(eq(agents.id, ctx.agent.id))

      await broadcastAgentUpdate(ctx.agent.id, pr)
      return pr
    },
  )
}

/**
 * Agent-scoped PR routes: details, create, mark-ready, re-request review,
 * merge. Each route reads the agent row, resolves the repo's remote URL,
 * performs the requested mutation against GitHub, then re-fetches PRStatus
 * and broadcasts an `agent:updated` event so every connected client sees
 * the new state.
 */
export const agentPrRoutes: FastifyPluginAsyncZod = async (app) => {
  registerDetailsRoute(app)
  registerCreateRoute(app)
  registerReadyRoute(app)
  registerRerequestRoute(app)
  registerMergeRoute(app)
}
