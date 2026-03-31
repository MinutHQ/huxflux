import type { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, repos } from "../db/schema.js"
import { createPR, getPRStatus, getPRDetails, markPRReady, rerequestReview } from "../github/client.js"
import { getRemoteUrl } from "../git/worktrees.js"
import { broadcast } from "../ws/handler.js"
import type { PRStatus, PRDetails } from "../types.js"

function prStatusToAgentStatus(pr: PRStatus): string {
  if (pr.merged) return "done"
  if (pr.state === "closed") return "cancelled"
  if (pr.draft) return "in-progress"
  return "in-review"
}

export async function githubRoutes(app: FastifyInstance) {
  // GET /api/agents/:id/pr/details — full PR info with reviews + checks
  app.get<{ Params: { id: string } }>("/api/agents/:id/pr/details", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.prNumber) return reply.code(404).send({ error: "No PR on this agent" })
    if (!agent.repoId) return reply.code(400).send({ error: "Agent has no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const repoUrl = await getRemoteUrl(repo.path, repo.remote)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })

    return getPRDetails(repoUrl, agent.prNumber)
  })

  // POST /api/agents/:id/pr — create a PR for the agent's branch
  app.post<{
    Params: { id: string }
    Body: { title: string; body?: string; draft?: boolean }
  }>("/api/agents/:id/pr", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.repoId) return reply.code(400).send({ error: "Agent has no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const repoUrl = await getRemoteUrl(repo.path, repo.remote)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })
    const baseBranch = (agent.baseBranch ?? repo.branchFrom).replace(/^origin\//, "")

    const { url, number } = await createPR({
      repoUrl,
      branch: agent.branch,
      baseBranch,
      title: req.body.title,
      body: req.body.body,
      draft: req.body.draft ?? false,
    })

    const pr = await getPRStatus(repoUrl, number)
    const newStatus = prStatusToAgentStatus(pr)
    const now = new Date().toISOString()

    await db.update(agents)
      .set({ pr: url, prNumber: number, prStatus: JSON.stringify(pr), status: newStatus, updatedAt: now })
      .where(eq(agents.id, agent.id))

    const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
    broadcast({ type: "agent:updated", agent: { ...updated, prStatus: pr } as any })

    return pr
  })

  // PUT /api/agents/:id/pr/ready — mark draft PR as ready for review
  app.put<{ Params: { id: string } }>("/api/agents/:id/pr/ready", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.prNumber) return reply.code(400).send({ error: "No PR on this agent" })
    if (!agent.repoId) return reply.code(400).send({ error: "Agent has no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const repoUrl = await getRemoteUrl(repo.path, repo.remote)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })

    await markPRReady(repoUrl, agent.prNumber)

    const pr = await getPRStatus(repoUrl, agent.prNumber)
    const now = new Date().toISOString()

    await db.update(agents)
      .set({ prStatus: JSON.stringify(pr), status: "in-review", updatedAt: now })
      .where(eq(agents.id, agent.id))

    const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
    broadcast({ type: "agent:updated", agent: { ...updated, prStatus: pr } as any })

    return pr
  })

  // POST /api/agents/:id/pr/rerequest-review — re-request review from change requesters
  app.post<{ Params: { id: string } }>("/api/agents/:id/pr/rerequest-review", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.prNumber) { console.log("[rerequest] no prNumber on agent", agent.id); return reply.code(400).send({ error: "No PR on this agent" }) }
    if (!agent.repoId) { console.log("[rerequest] no repoId on agent", agent.id); return reply.code(400).send({ error: "Agent has no repo" }) }

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const repoUrl = await getRemoteUrl(repo.path, repo.remote)
    console.log("[rerequest] repoUrl=", repoUrl, "prNumber=", agent.prNumber)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })

    try {
      await rerequestReview(repoUrl, agent.prNumber)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      console.error("[rerequest] error:", msg)
      return reply.code(400).send({ error: msg })
    }

    const pr = await getPRStatus(repoUrl, agent.prNumber)
    const now = new Date().toISOString()

    await db.update(agents)
      .set({ prStatus: JSON.stringify(pr), updatedAt: now })
      .where(eq(agents.id, agent.id))

    const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
    broadcast({ type: "agent:updated", agent: { ...updated, prStatus: pr } as any })

    return pr
  })
}
