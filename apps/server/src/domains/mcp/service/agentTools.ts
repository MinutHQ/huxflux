import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { FastifyInstance } from "fastify"
import { z } from "zod/v4"
import { isAgentRunning } from "../../agent-runner/agent-runner.service.js"
import { callApi } from "./apiClient.js"
import { apiErrorResult, textResult } from "./toolResult.js"

interface AgentRow {
  id: string
  title: string
  status: string
  branch: string
  model: string
  provider?: string | null
  repoId?: string | null
  location: string
  description?: string | null
  pr?: string | null
  prNumber?: number | null
  createdAt: string
  updatedAt: string
  diffSummary?: { additions: number; deletions: number }
  pendingQuestion?: unknown
}

interface MessageRow {
  id: string
  role: string
  content: string
  sender?: string | null
  createdAt: string
  durationMs?: number | null
  toolCalls?: Array<{ tool: string }>
}

type AgentDetail = AgentRow & { messages: MessageRow[] }

const MAX_MESSAGE_CHARS = 4000

/** Trims a DB agent row down to the fields an assistant needs to reason about it. */
export function summarizeAgent(a: AgentRow) {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    running: isAgentRunning(a.id),
    branch: a.branch,
    model: a.model,
    provider: a.provider ?? "claude",
    repoId: a.repoId ?? null,
    location: a.location,
    description: a.description ?? null,
    pr: a.pr ?? null,
    diffSummary: a.diffSummary,
    pendingQuestion: a.pendingQuestion ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

function summarizeMessage(m: MessageRow) {
  const truncated = m.content.length > MAX_MESSAGE_CHARS
  return {
    id: m.id,
    role: m.role,
    sender: m.sender ?? undefined,
    content: truncated ? `${m.content.slice(0, MAX_MESSAGE_CHARS)}\n…[truncated]` : m.content,
    tools: m.toolCalls?.map((t) => t.tool),
    createdAt: m.createdAt,
  }
}

export function registerAgentReadTools(server: McpServer, app: FastifyInstance): void {
  server.registerTool(
    "list_agents",
    {
      title: "List agents",
      description: "List Huxflux agents (one per worktree). Optionally filter by status.",
      inputSchema: {
        status: z.string().optional().describe("Only return agents with this status, e.g. in-progress, review, done"),
      },
    },
    async ({ status }) => {
      const result = await callApi<AgentRow[]>(app, "GET", "/api/agents")
      if (!result.ok) return apiErrorResult("list_agents", result)
      const rows = status ? result.data.filter((a) => a.status === status) : result.data
      return textResult(rows.map(summarizeAgent))
    },
  )

  server.registerTool(
    "get_agent",
    {
      title: "Get agent",
      description:
        "Fetch one agent with its recent conversation. Use this to check whether a spawned agent has finished and what it answered.",
      inputSchema: {
        agentId: z.string().describe("Agent id from create_agent or list_agents"),
        messageLimit: z.number().int().min(1).max(50).optional().describe("How many of the latest messages to include (default 10)"),
      },
    },
    async ({ agentId, messageLimit }) => {
      const result = await callApi<AgentDetail>(app, "GET", `/api/agents/${encodeURIComponent(agentId)}`)
      if (!result.ok) return apiErrorResult("get_agent", result)
      const limit = messageLimit ?? 10
      return textResult({
        ...summarizeAgent(result.data),
        messages: result.data.messages.slice(-limit).map(summarizeMessage),
      })
    },
  )
}

export function registerSendMessageTool(server: McpServer, app: FastifyInstance): void {
  server.registerTool(
    "send_message",
    {
      title: "Send message to agent",
      description:
        "Send a follow-up prompt to an existing agent. Starts a new turn, or delivers into the running turn if one is active.",
      inputSchema: {
        agentId: z.string().describe("Agent id from create_agent or list_agents"),
        content: z.string().min(1).describe("The prompt to send"),
        planMode: z.boolean().optional().describe("Ask the agent to plan without editing files"),
      },
    },
    async ({ agentId, content, planMode }) => {
      const result = await callApi<{ status: string }>(
        app,
        "POST",
        `/api/agents/${encodeURIComponent(agentId)}/messages`,
        { content, planMode },
      )
      if (!result.ok) return apiErrorResult("send_message", result)
      return textResult({ agentId, status: result.data.status })
    },
  )
}
