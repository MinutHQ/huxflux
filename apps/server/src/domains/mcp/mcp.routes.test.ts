import { afterEach, beforeEach, describe, expect, it } from "vitest"
import Fastify, { type FastifyInstance } from "fastify"
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AddressInfo } from "node:net"
import { createTestDb, createGitTmpRepo, silenceLogs, type TestDb, type GitTmpRepo } from "../../../test/harness.js"
import { config } from "../../config.js"
import { authHook } from "../../auth.js"
import { repos } from "../repos/repos.db.js"
import { reposPlugin } from "../repos/repos.routes.js"
import { agentsPlugin } from "../agents/agents.routes.js"
import { unwatchWorktree } from "../git/watcher.js"
import { mcpPlugin } from "./mcp.routes.js"
import { setPendingQuestion, getPendingQuestion, clearPendingQuestion } from "../../askStore.js"
import { runningProcesses } from "../agent-runner/service/processRegistry.js"
import type { ChildProcess } from "node:child_process"

const TOKEN = "mcp-test-token"

interface TextContent { type: "text"; text: string }

function textBlocks(result: unknown): TextContent[] {
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) throw new Error("expected a content array")
  return content as TextContent[]
}

/**
 * Stands in for a running CLI. `answerPendingQuestion` only needs a writable
 * stdin to write the control response to, so a real subprocess is unnecessary.
 */
function fakeProcess(): { written: string[]; proc: ChildProcess } {
  const written: string[] = []
  const proc = {
    stdin: { destroyed: false, writable: true, write: (line: string) => { written.push(line); return true } },
  } as unknown as ChildProcess
  return { written, proc }
}

function parseText(result: unknown): unknown {
  const first = textBlocks(result)[0]
  if (!first || first.type !== "text") throw new Error("expected a text content block")
  return JSON.parse(first.text)
}

describe("mcp domain", () => {
  let testDb: TestDb
  let repo: GitTmpRepo
  let workspaces: string
  let app: FastifyInstance
  let baseUrl: string
  let client: Client | null = null
  let logs: ReturnType<typeof silenceLogs>
  const createdAgentIds: string[] = []
  const previousToken = config.authToken

  beforeEach(async () => {
    logs = silenceLogs()
    testDb = createTestDb()
    repo = createGitTmpRepo()
    workspaces = mkdtempSync(join(tmpdir(), "huxflux-mcp-ws-"))
    config.authToken = TOKEN

    testDb.db.insert(repos).values({
      id: "repo-1",
      name: "demo",
      path: repo.path,
      workspacesPath: workspaces,
      branchFrom: "main",
      remote: "origin",
      type: "git",
      createdAt: new Date().toISOString(),
    }).run()

    app = Fastify().withTypeProvider<ZodTypeProvider>()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    app.addHook("preHandler", authHook)
    await app.register(reposPlugin)
    await app.register(agentsPlugin)
    await app.register(mcpPlugin)
    await app.listen({ port: 0, host: "127.0.0.1" })
    const address = app.server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    if (client) { await client.close(); client = null }
    for (const id of createdAgentIds) unwatchWorktree(id)
    createdAgentIds.length = 0
    await app.close()
    config.authToken = previousToken
    testDb.close()
    repo.cleanup()
    rmSync(workspaces, { recursive: true, force: true })
    logs.restore()
  })

  async function connect(): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
    })
    client = new Client({ name: "mcp-test", version: "0.0.0" })
    await client.connect(transport)
    return client
  }

  it("rejects requests without the bearer token", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })
    expect(res.status).toBe(401)
  })

  it("lists the seven huxflux tools", async () => {
    const c = await connect()
    const { tools } = await c.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual([
      "answer_question", "create_agent", "get_agent", "list_agents", "list_repos", "send_message", "set_agent_status",
    ])
  })

  it("list_repos returns registered repos", async () => {
    const c = await connect()
    const result = await c.callTool({ name: "list_repos", arguments: {} })
    expect(result.isError).toBeFalsy()
    const repoList = parseText(result) as Array<{ id: string; name: string; type: string; defaultBaseBranch: string }>
    expect(repoList).toHaveLength(1)
    expect(repoList[0]).toEqual({ id: "repo-1", name: "demo", path: repo.path, type: "git", defaultBaseBranch: "main" })
  })

  it("create_agent spawns a worktree and is visible through list_agents and get_agent", async () => {
    const c = await connect()
    const created = await c.callTool({
      name: "create_agent",
      arguments: { repoId: "repo-1", title: "Fix Login Bug!" },
    })
    expect(created.isError).toBeFalsy()
    const agent = parseText(created) as { id: string; branch: string; worktreePath: string | null; prompt: string | null; status: string }
    createdAgentIds.push(agent.id)

    expect(agent.branch).toBe("agent/fix-login-bug")
    expect(agent.status).toBe("in-progress")
    expect(agent.prompt).toBeNull()
    expect(agent.worktreePath).not.toBeNull()
    expect(existsSync(join(agent.worktreePath!, ".git"))).toBe(true)

    const listed = parseText(await c.callTool({ name: "list_agents", arguments: {} })) as Array<{ id: string; running: boolean }>
    expect(listed.map((a) => a.id)).toEqual([agent.id])
    expect(listed[0]?.running).toBe(false)

    const detail = parseText(await c.callTool({ name: "get_agent", arguments: { agentId: agent.id, messageLimit: 5 } })) as {
      id: string; title: string; messages: unknown[]
    }
    expect(detail.id).toBe(agent.id)
    expect(detail.title).toBe("Fix Login Bug!")
    expect(detail.messages).toEqual([])
  })

  it("create_agent can start in triage and set_agent_status moves it out", async () => {
    const c = await connect()
    const created = await c.callTool({
      name: "create_agent",
      arguments: { repoId: "repo-1", title: "Look at flaky test", status: "triage" },
    })
    expect(created.isError).toBeFalsy()
    const agent = parseText(created) as { id: string; status: string }
    createdAgentIds.push(agent.id)
    expect(agent.status).toBe("triage")

    const triaged = parseText(await c.callTool({ name: "list_agents", arguments: { status: "triage" } })) as Array<{ id: string }>
    expect(triaged.map((a) => a.id)).toEqual([agent.id])

    const moved = await c.callTool({ name: "set_agent_status", arguments: { agentId: agent.id, status: "backlog" } })
    expect(moved.isError).toBeFalsy()
    expect(parseText(moved)).toEqual({ agentId: agent.id, status: "backlog" })

    const after = parseText(await c.callTool({ name: "list_agents", arguments: { status: "triage" } })) as unknown[]
    expect(after).toEqual([])
  })

  it("set_agent_status rejects an unknown status", async () => {
    const c = await connect()
    const result = await c.callTool({ name: "set_agent_status", arguments: { agentId: "missing", status: "nope" } })
    expect(result.isError).toBe(true)
  })

  it("create_agent rejects an unknown repoId without creating anything", async () => {
    const c = await connect()
    const result = await c.callTool({ name: "create_agent", arguments: { repoId: "nope", title: "x" } })
    expect(result.isError).toBe(true)
    expect(textBlocks(result)[0]?.text).toContain('Unknown repoId "nope"')
    const listed = parseText(await c.callTool({ name: "list_agents", arguments: {} })) as unknown[]
    expect(listed).toEqual([])
  })

  it("get_agent reports a 404 from the underlying route as a tool error", async () => {
    const c = await connect()
    const result = await c.callTool({ name: "get_agent", arguments: { agentId: "missing" } })
    expect(result.isError).toBe(true)
    expect(textBlocks(result)[0]?.text).toContain("HTTP 404")
  })

  it("answer_question surfaces the route's 404 when nothing is pending", async () => {
    const c = await connect()
    const created = await c.callTool({ name: "create_agent", arguments: { repoId: "repo-1", title: "No Question" } })
    const agent = parseText(created) as { id: string }
    createdAgentIds.push(agent.id)

    const result = await c.callTool({
      name: "answer_question",
      arguments: { agentId: agent.id, answers: { "Which database?": "Postgres" } },
    })
    expect(result.isError).toBe(true)
    expect(textBlocks(result)[0]?.text).toContain("HTTP 404")
    expect(textBlocks(result)[0]?.text).toContain("No pending question")
  })

  it("answer_question reports an unknown agent as a tool error", async () => {
    const c = await connect()
    const result = await c.callTool({
      name: "answer_question",
      arguments: { agentId: "missing", answers: { q: "a" } },
    })
    expect(result.isError).toBe(true)
    expect(textBlocks(result)[0]?.text).toContain("HTTP 404")
  })

  it("answer_question rejects a call that omits answers", async () => {
    const c = await connect()
    const result = await c.callTool({ name: "answer_question", arguments: { agentId: "x" } })
    expect(result.isError).toBe(true)
  })

  it("answer_question writes the answers to the waiting agent and clears the question", async () => {
    const c = await connect()
    const created = await c.callTool({ name: "create_agent", arguments: { repoId: "repo-1", title: "Needs Input" } })
    const agent = parseText(created) as { id: string }
    createdAgentIds.push(agent.id)

    const questions = [{ question: "Which database?", header: "DB", options: [{ label: "Postgres" }, { label: "SQLite" }] }]
    const fake = fakeProcess()
    runningProcesses.set(agent.id, fake.proc)
    setPendingQuestion(agent.id, "req-1", "tu-1", questions)

    try {
      const result = await c.callTool({
        name: "answer_question",
        arguments: { agentId: agent.id, answers: { "Which database?": "Postgres" } },
      })

      expect(result.isError).toBeFalsy()
      expect(parseText(result)).toEqual({ agentId: agent.id, answered: ["Which database?"] })

      // The CLI is unblocked by a control response on stdin carrying the answers.
      expect(fake.written).toHaveLength(1)
      const sent = JSON.parse(fake.written[0]!) as {
        response: { request_id: string; response: { behavior: string; updatedInput: { answers: Record<string, string> } } }
      }
      expect(sent.response.request_id).toBe("req-1")
      expect(sent.response.response.behavior).toBe("allow")
      expect(sent.response.response.updatedInput.answers).toEqual({ "Which database?": "Postgres" })

      // Answering consumes the question, so a second call has nothing to answer.
      expect(getPendingQuestion(agent.id)).toBeUndefined()
    } finally {
      runningProcesses.delete(agent.id)
      clearPendingQuestion(agent.id)
    }
  })

  it("answer_question reports the question as expired when the agent stopped running", async () => {
    const c = await connect()
    const created = await c.callTool({ name: "create_agent", arguments: { repoId: "repo-1", title: "Gone Away" } })
    const agent = parseText(created) as { id: string }
    createdAgentIds.push(agent.id)

    // Pending question, but no live process to write the control response to.
    setPendingQuestion(agent.id, "req-2", "tu-2", [{ question: "Still there?" }])

    try {
      const result = await c.callTool({
        name: "answer_question",
        arguments: { agentId: agent.id, answers: { "Still there?": "yes" } },
      })
      expect(result.isError).toBe(true)
      expect(textBlocks(result)[0]?.text).toContain("HTTP 409")
      expect(textBlocks(result)[0]?.text).toContain("no longer running")
    } finally {
      clearPendingQuestion(agent.id)
    }
  })
})
