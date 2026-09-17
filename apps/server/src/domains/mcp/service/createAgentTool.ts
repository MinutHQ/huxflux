import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { FastifyInstance } from "fastify"
import { z } from "zod/v4"
import { titleToBranchSlug } from "../../agents/title.js"
import { callApi } from "./apiClient.js"
import { fetchRepos, type RepoRow } from "./repoTools.js"
import { apiErrorResult, errorResult, textResult } from "./toolResult.js"

const createAgentInput = {
  repoId: z.string().optional().describe("Repository id from list_repos. Omit to create an agent with no repository."),
  title: z.string().min(1).describe("Short human-readable title, shown in the Huxflux UI"),
  prompt: z.string().optional().describe("First message to send. When set, the agent starts working immediately."),
  branch: z.string().optional().describe("Git branch to create. Defaults to <repo branch prefix>/<slug of title>."),
  baseBranch: z.string().optional().describe("Branch to fork from. Defaults to the repo's configured base branch."),
  model: z.string().optional().describe("Model name as shown in Huxflux, e.g. 'Sonnet 4.6'. Defaults to the server setting."),
  provider: z.string().optional().describe("Provider id, e.g. claude, codex, gemini. Defaults to the server setting."),
  description: z.string().optional().describe("Longer task description stored on the agent"),
}

interface CreatedAgent {
  id: string
  title: string
  branch: string
  location: string
  status: string
}

/** Mirrors the web client's default: `<branchPrefix|agent>/<slug>`, or `local` for folder repos. */
export function deriveBranch(repo: RepoRow | undefined, title: string): string {
  if (repo?.type === "folder") return "local"
  const prefix = repo?.branchPrefix ? `${repo.branchPrefix.replace(/\/$/, "")}/` : "agent/"
  return `${prefix}${titleToBranchSlug(title) || "agent"}`
}

export function registerCreateAgentTool(server: McpServer, app: FastifyInstance): void {
  server.registerTool(
    "create_agent",
    {
      title: "Create agent",
      description:
        "Spawn a new Huxflux coding agent in its own git worktree. Pass `prompt` to hand it a task right away; " +
        "then poll get_agent to read its answer. Call list_repos first to find the repoId.",
      inputSchema: createAgentInput,
    },
    async (input) => {
      let repo: RepoRow | undefined
      if (input.repoId) {
        const repos = await fetchRepos(app)
        if (!repos.ok) return apiErrorResult("create_agent", repos)
        repo = repos.data.find((r) => r.id === input.repoId)
        if (!repo) return errorResult(`Unknown repoId "${input.repoId}". Call list_repos to see valid ids.`)
      }

      const branch = input.branch ?? deriveBranch(repo, input.title)
      const created = await callApi<CreatedAgent>(app, "POST", "/api/agents", {
        repoId: input.repoId,
        title: input.title,
        branch,
        baseBranch: input.baseBranch,
        model: input.model,
        provider: input.provider,
        description: input.description,
        noWorktree: repo?.type === "folder" ? true : undefined,
      })
      if (!created.ok) return apiErrorResult("create_agent", created)

      const worktree = await callApi<{ path: string }>(
        app, "GET", `/api/agents/${encodeURIComponent(created.data.id)}/worktree-path`,
      )

      let promptStatus: string | null = null
      if (input.prompt) {
        const sent = await callApi<{ status: string }>(
          app, "POST", `/api/agents/${encodeURIComponent(created.data.id)}/messages`,
          // No `sender`: messages tagged with one render collapsed as a
          // "linked workspace" card, and the spawning prompt should be readable.
          { content: input.prompt },
        )
        if (!sent.ok) return apiErrorResult("create_agent (agent created, but sending the prompt)", sent)
        promptStatus = sent.data.status
      }

      return textResult({
        id: created.data.id,
        title: created.data.title,
        branch: created.data.branch,
        location: created.data.location,
        worktreePath: worktree.ok ? worktree.data.path : null,
        status: created.data.status,
        prompt: promptStatus,
        next: "Call get_agent with this id to read the agent's progress and final answer.",
      })
    },
  )
}
