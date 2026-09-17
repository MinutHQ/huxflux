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

const TOKEN = "mcp-test-token"

interface TextContent { type: "text"; text: string }

function textBlocks(result: unknown): TextContent[] {
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) throw new Error("expected a content array")
  return content as TextContent[]
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

  it("lists the five huxflux tools", async () => {
    const c = await connect()
    const { tools } = await c.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(["create_agent", "get_agent", "list_agents", "list_repos", "send_message"])
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
})
