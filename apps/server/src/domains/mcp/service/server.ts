import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { FastifyInstance } from "fastify"
import { config } from "../../../config.js"
import { SERVER_VERSION } from "../../../version.js"
import { registerRepoTools } from "./repoTools.js"
import { registerAgentReadTools, registerSendMessageTool } from "./agentTools.js"
import { registerCreateAgentTool } from "./createAgentTool.js"

/**
 * Builds a fresh MCP server with every Huxflux tool registered. The transport
 * is stateless, so one instance is created per HTTP request and discarded
 * once the response ends. Construction is cheap: it only wires closures.
 */
export function buildMcpServer(app: FastifyInstance): McpServer {
  const server = new McpServer(
    { name: config.mcpServerName, version: SERVER_VERSION },
    {
      instructions:
        "Huxflux runs coding agents in isolated git worktrees. Typical flow: list_repos, then create_agent with a " +
        "prompt, then poll get_agent until `running` is false and read the last assistant message. Use send_message " +
        "for follow-ups on the same agent.",
    },
  )
  registerRepoTools(server, app)
  registerCreateAgentTool(server, app)
  registerSendMessageTool(server, app)
  registerAgentReadTools(server, app)
  return server
}
