import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { logger } from "../../logger.js"
import { buildMcpServer } from "./service/server.js"

/**
 * Fastify plugin for the mcp domain. Exposes the Model Context Protocol over
 * Streamable HTTP at `/mcp` so other AI assistants (Claude Code, Cursor,
 * Codex, ...) can spawn and drive Huxflux agents. Auth is the normal Bearer
 * `AUTH_TOKEN`; the auth hook treats `/mcp` like `/api/`.
 *
 * The transport runs stateless: every POST builds its own McpServer and
 * transport, handles one JSON-RPC exchange, and tears both down when the
 * response closes. No session table, nothing to leak across clients.
 */
export const mcpPlugin: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    schema: { hide: true },
    handler: (req, reply) => handleMcpRequest(app, req, reply),
  })
}

async function handleMcpRequest(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const server = buildMcpServer(app)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  // The SDK writes straight to the Node response (JSON or SSE), so take the
  // socket away from Fastify's reply pipeline before handing it over.
  reply.hijack()
  reply.raw.on("close", () => {
    void transport.close()
    void server.close()
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req.raw, reply.raw, req.body)
  } catch (err) {
    logger.error({ err }, "[mcp] request failed")
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(500, { "content-type": "application/json" })
      reply.raw.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      }))
    }
  }
}
