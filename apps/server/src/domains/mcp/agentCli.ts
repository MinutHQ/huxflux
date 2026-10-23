import { parseArgs } from "node:util"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

export const AGENT_USAGE = `Usage:
  huxflux agent list [--status <status>]
  huxflux agent get <id>
  huxflux agent create --title <title> [--repo <id or name>] [--status <status>]
                       [--prompt <text>] [--branch <name>] [--description <text>]
  huxflux agent status <id> <status>

Statuses: triage, in-progress, draft-pr, in-review, backlog, done, cancelled
Output is JSON on stdout. Errors go to stderr with exit code 1.`

/** One MCP tool call the CLI resolves to. `repo` is resolved to a repoId once connected. */
export interface AgentToolCall {
  tool: "list_agents" | "get_agent" | "set_agent_status" | "create_agent"
  args: Record<string, string>
  repo?: string
}

interface ToolText { type: string; text?: string }

class CliError extends Error {}

/**
 * Turns `huxflux agent ...` arguments into the MCP tool call to make. Pure, so
 * bad input fails before any connection to the server is attempted.
 */
export function parseAgentArgs(argv: string[]): AgentToolCall {
  const [sub, ...rest] = argv
  let parsed: ReturnType<typeof parseFlags>
  try {
    parsed = parseFlags(rest)
  } catch (err) {
    throw new CliError(`${(err as Error).message}\n\n${AGENT_USAGE}`)
  }
  const { values, positionals } = parsed
  switch (sub) {
    case "list":
      return { tool: "list_agents", args: defined({ status: values.status }) }
    case "get":
      return { tool: "get_agent", args: { agentId: required(positionals[0], "agent id") } }
    case "status":
      return {
        tool: "set_agent_status",
        args: { agentId: required(positionals[0], "agent id"), status: required(positionals[1], "status") },
      }
    case "create":
      return {
        tool: "create_agent",
        args: defined({
          title: required(values.title, "--title"),
          status: values.status,
          prompt: values.prompt,
          branch: values.branch,
          description: values.description,
        }),
        repo: values.repo,
      }
    default:
      throw new CliError(AGENT_USAGE)
  }
}

/**
 * `huxflux agent ...`: drives the running server through its own MCP tools, so
 * an assistant with shell access gets the same behaviour (branch defaults,
 * repo validation, prompt hand-off) as one connected over MCP.
 */
export async function runAgentCommand(baseUrl: string, token: string, argv: string[]): Promise<void> {
  try {
    const call = parseAgentArgs(argv)
    const client = new Client({ name: "huxflux-cli", version: "1" })
    const transport = new StreamableHTTPClientTransport(new URL("/mcp", baseUrl), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    })
    try {
      await client.connect(transport)
    } catch (err) {
      throw new CliError(`Could not reach the huxflux server at ${baseUrl}. Is it running? (${(err as Error).message})`)
    }
    try {
      const args = call.repo ? { ...call.args, repoId: await resolveRepoId(client, call.repo) } : call.args
      console.info(await callTool(client, call.tool, args))
    } finally {
      await client.close()
    }
  } catch (err) {
    console.error(err instanceof CliError ? err.message : err)
    process.exitCode = 1
  }
}

function parseFlags(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    options: {
      status: { type: "string" },
      title: { type: "string" },
      repo: { type: "string" },
      prompt: { type: "string" },
      branch: { type: "string" },
      description: { type: "string" },
    },
  })
}

/** Accepts a repo id or a repo name, since a name is what a human or assistant usually knows. */
async function resolveRepoId(client: Client, repo: string): Promise<string> {
  const repos = JSON.parse(await callTool(client, "list_repos", {})) as Array<{ id: string; name: string }>
  const match = repos.find((r) => r.id === repo) ?? repos.find((r) => r.name === repo)
  if (!match) throw new CliError(`Unknown repo "${repo}". Known repos: ${repos.map((r) => r.name).join(", ")}`)
  return match.id
}

async function callTool(client: Client, name: string, args: Record<string, string>): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as ToolText[]).map((c) => c.text ?? "").join("\n")
  if (result.isError) throw new CliError(text)
  return text
}

function required(value: string | undefined, what: string): string {
  if (!value) throw new CliError(`Missing ${what}.\n\n${AGENT_USAGE}`)
  return value
}

function defined(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((e): e is [string, string] => e[1] !== undefined))
}
