import type { FastifyInstance } from "fastify"
import { spawn } from "node:child_process"
import * as path from "node:path"
import * as os from "node:os"
import * as fsSync from "node:fs"
import { randomUUID } from "node:crypto"
import { eq, isNull, isNotNull, and, asc } from "drizzle-orm"
import { db } from "../db/index.js"
import { agents, repos, prChatMessages } from "../db/schema.js"
import { createPR, getPRStatus, getPRDetails, markPRReady, rerequestReview, mergePR, listReviewRequestedPRs, getPRFilesForOwnerRepo, getPRDetailsForOwnerRepo, replyToReviewComment, deleteReviewComment, submitPRReview, createSinglePRComment, resolveReviewThread, getPRFileContent } from "../github/client.js"
import { getRemoteUrl } from "../git/worktrees.js"
import { broadcast } from "../ws/handler.js"
import { prStatusToAgentStatus } from "../github/prStatus.js"
import { getClaudeBin, resolveModelAlias } from "../claude/runner.js"
import { getSettings } from "../settings.js"
import type { PRStatus, PRDetails, OpenPRWithRepo } from "../types.js"

/** Read skill body (content after frontmatter) for a given skill name. Returns null if not found. */
function readSkillBody(name: string): string | null {
  const candidates = [
    path.join(os.homedir(), ".claude", "skills", name, "SKILL.md"),
    path.join(os.homedir(), ".claude", "skills", name, "skill.md"),
  ]
  for (const p of candidates) {
    try {
      const content = fsSync.readFileSync(p, "utf8")
      // Strip frontmatter
      const body = content.replace(/^---[\s\S]*?---\r?\n/, "").trim()
      if (body) return body
    } catch { /* not found */ }
  }
  return null
}

/** Replace /command tokens in a string with their skill body content. */
function resolveSlashCommands(text: string): string {
  return text.replace(/\/([a-zA-Z0-9_-]+)/g, (match, name) => {
    const body = readSkillBody(name)
    return body ?? match
  })
}

/** Extract "owner/repo" from a git remote URL, lowercased for comparison.
 *  Handles github.com HTTPS, github.com SSH, and custom SSH host aliases (e.g. gh_work:owner/repo). */
function remoteToRepoId(url: string): string | null {
  const cleaned = url.trim().replace(/\/$/, "")
  // HTTPS: https://github.com/owner/repo[.git]
  const https = cleaned.match(/^https?:\/\/[^/]+\/([^/]+\/[^/?#]+?)(?:\.git)?$/)
  if (https) return https[1].toLowerCase()
  // SSH: git@<any-host>:owner/repo[.git]
  const ssh = cleaned.match(/^git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/)
  if (ssh) return ssh[1].toLowerCase()
  return null
}

// In-memory map of currently active reviews: "owner/repo/number" → { startedAt, currentStep }
const activeReviews = new Map<string, { startedAt: number; currentStep: number }>()

export async function githubRoutes(app: FastifyInstance) {
  // GET /api/prs — list open PRs where the authenticated user is a requested reviewer
  app.get("/api/prs", async (_req, _reply) => {
    const rawPRs = await listReviewRequestedPRs()

    // Look up agents by their PR URL to associate agentId with each PR
    const allAgents = db.select({ id: agents.id, pr: agents.pr })
      .from(agents)
      .where(and(isNull(agents.deletedAt), isNotNull(agents.pr)))
      .all()
    const agentByPrUrl = new Map<string, string>()
    for (const a of allAgents) {
      if (a.pr) agentByPrUrl.set(a.pr, a.id)
    }

    return rawPRs.map((pr): OpenPRWithRepo => ({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      authorAvatar: pr.authorAvatar,
      branch: pr.branch,
      baseBranch: pr.baseBranch,
      body: pr.body,
      additions: pr.additions,
      deletions: pr.deletions,
      createdAt: pr.createdAt,
      hasChangeRequests: pr.hasChangeRequests,
      draft: pr.draft,
      url: pr.url,
      reviewRequested: pr.reviewRequested,
      userReviewed: pr.userReviewed,
      isReadyToMerge: pr.mergeableState === "clean" && !pr.hasChangeRequests && !pr.draft,
      repoId: `${pr.owner}/${pr.repo}`,
      repoName: `${pr.owner}/${pr.repo}`,
      agentId: agentByPrUrl.get(pr.url),
    }))
  })

  // GET /api/prs/:owner/:repo/:number/files — files changed in a PR with patches
  app.get<{ Params: { owner: string; repo: string; number: string } }>(
    "/api/prs/:owner/:repo/:number/files",
    async (req, _reply) => {
      return getPRFilesForOwnerRepo(req.params.owner, req.params.repo, parseInt(req.params.number, 10))
    }
  )

  // GET /api/prs/:owner/:repo/:number/file-content?path=...&side=base|head — raw file content at PR ref
  app.get<{ Params: { owner: string; repo: string; number: string }; Querystring: { path?: string; side?: string } }>(
    "/api/prs/:owner/:repo/:number/file-content",
    async (req, reply) => {
      const { owner, repo, number } = req.params
      const { path: filePath = "", side = "head" } = req.query
      if (!filePath) return reply.code(400).send({ error: "path is required" })
      const content = await getPRFileContent(owner, repo, parseInt(number, 10), filePath, side as "base" | "head")
      reply.header("Content-Type", "text/plain")
      return content
    }
  )

  // GET /api/prs/:owner/:repo/:number/details — full PR details with reviews + threads
  app.get<{ Params: { owner: string; repo: string; number: string } }>(
    "/api/prs/:owner/:repo/:number/details",
    async (req, _reply) => {
      const { owner, repo, number } = req.params
      const details = await getPRDetailsForOwnerRepo(owner, repo, parseInt(number, 10))
      const key = `${owner}/${repo}/${number}`
      const active = activeReviews.get(key)
      return { ...details, reviewingStartedAt: active?.startedAt ?? null, reviewingCurrentStep: active?.currentStep ?? null }
    }
  )

  // POST /api/prs/:owner/:repo/:number/review — stream an agentic code review via SSE
  app.post<{
    Params: { owner: string; repo: string; number: string }
    Body: { existingComments?: Array<{ path: string; line: number; body: string }>; model?: string }
  }>(
    "/api/prs/:owner/:repo/:number/review",
    async (req, reply) => {
      const { owner, repo, number } = req.params
      const body = req.body as any
      const existingComments = body?.existingComments as Array<{ path: string; line: number; body: string }> | undefined
      const requestedModel = body?.model as string | undefined
      const prNumber = parseInt(number, 10)
      const repoSlug = `${owner}/${repo}`

      // Find a locally configured repo whose remote URL matches this PR's owner/repo
      const allRepos = db.select().from(repos).all()
      let matchedRepo: typeof allRepos[0] | null = null
      const debugRows: string[] = []
      for (const r of allRepos) {
        const remoteUrl = await getRemoteUrl(r.path, r.remote)
        const parsed = remoteUrl ? remoteToRepoId(remoteUrl) : null
        debugRows.push(`  ${r.name}: remote="${remoteUrl}" → parsed="${parsed}"`)
        if (parsed && parsed === repoSlug.toLowerCase()) {
          matchedRepo = r
          break
        }
      }

      if (!matchedRepo) {
        console.log(`[review] no local repo matched for "${repoSlug}" — using homedir as cwd\n${debugRows.join("\n")}`)
      }

      const reviewCwd = matchedRepo?.path ?? os.homedir()

      // Start SSE stream immediately
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": req.headers.origin ?? "*",
        "Access-Control-Allow-Credentials": "true",
        "X-Accel-Buffering": "no",
      })
      reply.hijack()

      const reviewKey = `${owner}/${repo}/${number}`
      const reviewState = { startedAt: Date.now(), currentStep: 0 }
      activeReviews.set(reviewKey, reviewState)

      const write = (data: string) => {
        try { reply.raw.write(data) } catch { /* connection closed */ }
      }
      const setStep = (step: number) => {
        if (step <= reviewState.currentStep) return
        reviewState.currentStep = step
        write(`data: ${JSON.stringify({ step })}\n\n`)
      }
      const end = () => {
        activeReviews.delete(reviewKey)
        clearInterval(keepalive)
        try { reply.raw.end() } catch { /* already ended */ }
      }

      // Send a comment every 15s to prevent WebKit/Tauri from timing out the connection
      const keepalive = setInterval(() => write(": ping\n\n"), 15_000)

      write(": connected\n\n")
      setStep(0) // Fetching diff

      let details: Awaited<ReturnType<typeof getPRDetailsForOwnerRepo>>
      let files: Awaited<ReturnType<typeof getPRFilesForOwnerRepo>>
      try {
        ;[details, files] = await Promise.all([
          getPRDetailsForOwnerRepo(owner, repo, prNumber),
          getPRFilesForOwnerRepo(owner, repo, prNumber),
        ])
      } catch (err) {
        write(`data: ${JSON.stringify({ error: `Failed to fetch PR: ${(err as Error).message}` })}\n\n`)
        write("data: [DONE]\n\n")
        end()
        return
      }

      setStep(1) // Building prompt from diff

      // Build the diff section from GitHub API patches — no git fetch needed
      const diffSection = files.map((f) => {
        const header = `### ${f.path} (+${f.additions}/-${f.deletions})`
        return f.patch ? `${header}\n\`\`\`diff\n${f.patch}\n\`\`\`` : header
      }).join("\n\n")

      setStep(2) // Starting review

      // Resolve any /slash-commands in the user's custom review prompt
      const settings = getSettings()
      const reviewModel = resolveModelAlias(requestedModel ?? settings.defaultModel)
      const userPrompt = settings.reviewPrompt?.trim()
        ? resolveSlashCommands(settings.reviewPrompt.trim())
        : ""

      // Build existing comments section to avoid duplicates on re-run
      let existingSection = ""
      if (existingComments?.length) {
        existingSection = `\n## Already-reviewed comments\nThe following comments have already been made on this PR. Do NOT repeat or rephrase them — only add NEW issues not already covered:\n` +
          existingComments.map((c) => `- ${c.path}:${c.line} — ${c.body}`).join("\n")
      }

      const prompt = [
        `Review pull request #${prNumber}: "${details.title}"`,
        `Branch: \`${details.branch}\` → \`${details.baseBranch}\``,
        details.body ? `\nDescription:\n${details.body}` : "",
        `\n## Changed files\n\n${diffSection}`,
        existingSection,
        `\n## Instructions`,
        `The diff above contains all the changes. Review them directly — do not run any shell commands or read any files.`,
        userPrompt ? `\n## Additional review instructions\n\n${userPrompt}` : "",
        `\n## Output format`,
        `After your analysis, end your response with a JSON block in EXACTLY this format (no extra fields):`,
        `\`\`\`json`,
        `{`,
        `  "summary": "One concise paragraph overall assessment",`,
        `  "verdict": "approve",`,
        `  "comments": [`,
        `    {`,
        `      "severity": "blocking",`,
        `      "type": "inline",`,
        `      "path": "src/foo.ts",`,
        `      "line": 42,`,
        `      "body": "Explanation of the issue"`,
        `    }`,
        `  ]`,
        `}`,
        `\`\`\``,
        `verdict is "approve", "request_changes", or "comment". severity is "blocking" (bugs/security),`,
        `"suggestion" (improvements), or "nit" (style). type is "inline" (file+line) or "general".`,
        `Only include comments for real issues. If no issues, use an empty array.`,
      ].filter(Boolean).join("\n")

      const claudeBin = getClaudeBin()
      const proc = spawn(
        claudeBin,
        [
          "--print",
          "--output-format", "stream-json",
          "--verbose",
          "--allowedTools", "Read,Glob,Grep",
          "--model", reviewModel,
          prompt,
        ],
        {
          cwd: reviewCwd,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME ?? ""}/.npm-global/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}`,
          },
        }
      )

      setStep(3) // Reading context — Claude is now running, may read files for context

      let buffer = ""
      let stderrOutput = ""
      let accumulatedText = ""

      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === "assistant") {
              for (const block of event.message.content) {
                if (block.type === "tool_use") {
                  setStep(3) // Reading files for context
                } else if (block.type === "text") {
                  accumulatedText += block.text
                  if (accumulatedText.trim().length > 20) setStep(4) // Analyzing code
                  if (accumulatedText.includes("```json")) setStep(5) // Forming conclusions
                  write(`data: ${JSON.stringify({ text: block.text })}\n\n`)
                }
              }
            }
          } catch { /* non-JSON line */ }
        }
      })

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString()
        stderrOutput += text
        for (const line of text.split("\n").filter((l) => l.trim())) {
          console.error(`[review ${owner}/${repo}#${number}] ${line}`)
        }
      })

      proc.on("close", (code) => {
        if (code !== 0 && stderrOutput) {
          write(`data: ${JSON.stringify({ error: stderrOutput.trim().split("\n").pop() ?? "Claude exited with error" })}\n\n`)
        }
        // Persist review to DB so it survives page reloads
        if (accumulatedText.trim()) {
          try {
            db.insert(prChatMessages).values({
              id: randomUUID(),
              repoId: `${owner}/${repo}`,
              prNumber,
              role: "assistant",
              content: accumulatedText,
              isReview: 1,
              reviewHeadSha: details.headSha,
              createdAt: new Date().toISOString(),
            }).run()
          } catch { /* non-fatal */ }
        }
        write("data: [DONE]\n\n")
        end()
      })

      proc.on("error", (err) => {
        write(`data: ${JSON.stringify({ error: `Failed to spawn claude: ${err.message}` })}\n\n`)
        write("data: [DONE]\n\n")
        end()
      })

      req.raw.on("close", () => proc.kill("SIGTERM"))
    }
  )

  // POST /api/prs/:owner/:repo/:number/chat — follow-up chat about the PR, streamed via SSE
  app.post<{
    Params: { owner: string; repo: string; number: string }
    Body: { messages: Array<{ role: "user" | "assistant"; content: string }>; model?: string }
  }>(
    "/api/prs/:owner/:repo/:number/chat",
    async (req, reply) => {
      const { owner, repo, number } = req.params
      const { messages, model: requestedModel } = req.body
      const prNumber = parseInt(number, 10)
      if (!messages?.length) return reply.code(400).send({ error: "messages required" })

      const allRepos = db.select().from(repos).all()
      let matchedRepo: typeof allRepos[0] | null = null
      for (const r of allRepos) {
        const remoteUrl = await getRemoteUrl(r.path, r.remote)
        const parsed = remoteUrl ? remoteToRepoId(remoteUrl) : null
        if (parsed && parsed === `${owner}/${repo}`.toLowerCase()) { matchedRepo = r; break }
      }
      const chatCwd = matchedRepo?.path ?? os.homedir()

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": req.headers.origin ?? "*",
        "Access-Control-Allow-Credentials": "true",
        "X-Accel-Buffering": "no",
      })
      reply.hijack()

      const write = (data: string) => { try { reply.raw.write(data) } catch { /* closed */ } }
      const end = () => { try { reply.raw.end() } catch { /* closed */ } }
      const keepalive = setInterval(() => write(": ping\n\n"), 15_000)

      write(": connected\n\n")

      // Persist the user's message immediately
      const userMsgId = randomUUID()
      try {
        db.insert(prChatMessages).values({
          id: userMsgId,
          repoId: `${owner}/${repo}`,
          prNumber,
          role: "user",
          content: messages[messages.length - 1].content,
          isReview: 0,
          createdAt: new Date().toISOString(),
        }).run()
      } catch { /* non-fatal */ }

      // Fetch PR metadata for context (lightweight — no diff)
      let prTitle = `#${prNumber}`
      let prBranch = ""
      try {
        const details = await getPRDetailsForOwnerRepo(owner, repo, prNumber)
        prTitle = `#${prNumber}: "${details.title}"`
        prBranch = details.branch ? ` (${details.branch} → ${details.baseBranch})` : ""
      } catch { /* non-fatal — continue without metadata */ }

      const history = messages.slice(0, -1)
      const lastMsg = messages[messages.length - 1]

      const prompt = [
        `You are a code review assistant for PR ${prTitle}${prBranch} in ${owner}/${repo}.`,
        `You can read files in the repository to answer questions about the code.`,
        history.length > 0
          ? `\nConversation so far:\n${history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")}`
          : "",
        `\nUser: ${lastMsg.content}`,
      ].filter(Boolean).join("\n")

      const chatModel = resolveModelAlias(requestedModel ?? getSettings().defaultModel)
      const proc = spawn(
        getClaudeBin(),
        ["--print", "--output-format", "stream-json", "--verbose", "--allowedTools", "Read,Glob,Grep", "--model", chatModel, prompt],
        {
          cwd: chatCwd,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME ?? ""}/.npm-global/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}`,
          },
        }
      )

      let buffer = ""
      let chatAccumulated = ""
      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === "assistant") {
              for (const block of event.message.content) {
                if (block.type === "text") {
                  chatAccumulated += block.text
                  write(`data: ${JSON.stringify({ text: block.text })}\n\n`)
                }
              }
            }
          } catch { /* non-JSON */ }
        }
      })

      proc.on("close", () => {
        clearInterval(keepalive)
        // Persist assistant response
        if (chatAccumulated.trim()) {
          try {
            db.insert(prChatMessages).values({
              id: randomUUID(),
              repoId: `${owner}/${repo}`,
              prNumber,
              role: "assistant",
              content: chatAccumulated,
              isReview: 0,
              createdAt: new Date().toISOString(),
            }).run()
          } catch { /* non-fatal */ }
        }
        write("data: [DONE]\n\n")
        end()
      })

      proc.on("error", (err) => {
        clearInterval(keepalive)
        write(`data: ${JSON.stringify({ error: `Failed to spawn claude: ${err.message}` })}\n\n`)
        write("data: [DONE]\n\n")
        end()
      })

      req.raw.on("close", () => { proc.kill("SIGTERM"); clearInterval(keepalive) })
    }
  )

  // GET /api/prs/:owner/:repo/:number/chat-messages — fetch persisted PR chat history
  app.get<{ Params: { owner: string; repo: string; number: string } }>(
    "/api/prs/:owner/:repo/:number/chat-messages",
    async (req, _reply) => {
      const { owner, repo, number } = req.params
      const repoId = `${owner}/${repo}`
      const prNumber = parseInt(number, 10)
      return db.select().from(prChatMessages)
        .where(and(eq(prChatMessages.repoId, repoId), eq(prChatMessages.prNumber, prNumber)))
        .orderBy(asc(prChatMessages.createdAt))
        .all()
        .map((m) => ({ ...m, isReview: m.isReview === 1, reviewHeadSha: m.reviewHeadSha ?? undefined }))
    }
  )

  // DELETE /api/prs/:owner/:repo/:number/chat-messages — clear PR chat history
  app.delete<{ Params: { owner: string; repo: string; number: string } }>(
    "/api/prs/:owner/:repo/:number/chat-messages",
    async (req, _reply) => {
      const { owner, repo, number } = req.params
      const repoId = `${owner}/${repo}`
      const prNumber = parseInt(number, 10)
      db.delete(prChatMessages)
        .where(and(eq(prChatMessages.repoId, repoId), eq(prChatMessages.prNumber, prNumber)))
        .run()
      return { ok: true }
    }
  )

  // POST /api/prs/:owner/:repo/:number/comment — post a single review comment
  app.post<{
    Params: { owner: string; repo: string; number: string }
    Body: { body: string; path?: string; line?: number }
  }>(
    "/api/prs/:owner/:repo/:number/comment",
    async (req, reply) => {
      const { owner, repo, number } = req.params
      const { body, path, line } = req.body
      if (!body?.trim()) return reply.code(400).send({ error: "body is required" })
      await createSinglePRComment(owner, repo, parseInt(number, 10), body.trim(), path, line)
      return { ok: true }
    }
  )

  // POST /api/prs/:owner/:repo/:number/submit-review — submit a GitHub review
  app.post<{
    Params: { owner: string; repo: string; number: string }
    Body: {
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
      body: string
      comments: Array<{ path: string; line: number; body: string; start_line?: number }>
    }
  }>(
    "/api/prs/:owner/:repo/:number/submit-review",
    async (req, reply) => {
      const { owner, repo, number } = req.params
      const { event, body, comments } = req.body
      if (!event) return reply.code(400).send({ error: "event is required" })
      await submitPRReview(owner, repo, parseInt(number, 10), event, body ?? "", comments ?? [])
      return { ok: true }
    }
  )

  // POST /api/prs/:owner/:repo/:number/comments/:commentId/reply
  app.post<{
    Params: { owner: string; repo: string; number: string; commentId: string }
    Body: { body: string }
  }>(
    "/api/prs/:owner/:repo/:number/comments/:commentId/reply",
    async (req, reply) => {
      const { owner, repo, number, commentId } = req.params
      if (!req.body.body?.trim()) return reply.code(400).send({ error: "Body is required" })
      await replyToReviewComment(owner, repo, parseInt(number, 10), parseInt(commentId, 10), req.body.body.trim())
      return { ok: true }
    }
  )

  // DELETE /api/prs/:owner/:repo/comments/:commentId — delete a review comment
  app.delete<{ Params: { owner: string; repo: string; commentId: string } }>(
    "/api/prs/:owner/:repo/comments/:commentId",
    async (req, _reply) => {
      const { owner, repo, commentId } = req.params
      await deleteReviewComment(owner, repo, parseInt(commentId, 10))
      return { ok: true }
    }
  )

  // POST /api/prs/threads/:threadId/resolve — resolve a review thread via GraphQL
  app.post<{ Params: { threadId: string } }>(
    "/api/prs/threads/:threadId/resolve",
    async (req, reply) => {
      const { threadId } = req.params
      await resolveReviewThread(threadId)
      return { ok: true }
    }
  )

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

  // POST /api/agents/:id/pr/merge — merge the agent's PR
  app.post<{ Params: { id: string }; Body: { method?: "merge" | "squash" | "rebase" } }>("/api/agents/:id/pr/merge", async (req, reply) => {
    const agent = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
    if (!agent) return reply.code(404).send({ error: "Not found" })
    if (!agent.prNumber) return reply.code(400).send({ error: "No PR on this agent" })
    if (!agent.repoId) return reply.code(400).send({ error: "Agent has no repo" })

    const repo = db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    if (!repo) return reply.code(404).send({ error: "Repo not found" })

    const repoUrl = await getRemoteUrl(repo.path, repo.remote)
    if (!repoUrl) return reply.code(400).send({ error: "Cannot resolve remote URL" })

    try {
      await mergePR(repoUrl, agent.prNumber, req.body?.method ?? "squash")
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message ?? String(err) })
    }

    const pr = await getPRStatus(repoUrl, agent.prNumber)
    const now = new Date().toISOString()
    await db.update(agents)
      .set({ prStatus: JSON.stringify(pr), status: "done", updatedAt: now })
      .where(eq(agents.id, agent.id))

    const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get()
    broadcast({ type: "agent:updated", agent: { ...updated, prStatus: pr } as any })

    return pr
  })

  // POST /api/prs/:owner/:repo/:number/merge — merge a PR by owner/repo/number
  app.post<{
    Params: { owner: string; repo: string; number: string }
    Body: { method?: "merge" | "squash" | "rebase" }
  }>("/api/prs/:owner/:repo/:number/merge", async (req, reply) => {
    const { owner, repo, number } = req.params
    const prNumber = parseInt(number, 10)
    const repoUrl = `https://github.com/${owner}/${repo}`

    try {
      await mergePR(repoUrl, prNumber, req.body?.method ?? "squash")
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message ?? String(err) })
    }

    return { ok: true, merged: true }
  })
}
