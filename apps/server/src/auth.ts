import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto"
import type { FastifyRequest, FastifyReply } from "fastify"
import { config } from "./config.js"

// Public endpoints that never require auth
const PUBLIC = new Set(["/health", "/api/config"])

export async function authHook(req: FastifyRequest, reply: FastifyReply) {
  if (PUBLIC.has(req.routeOptions?.url ?? req.url)) return

  if (!config.authToken) {
    return reply.code(503).send({ error: "AUTH_TOKEN is not configured" })
  }

  // WebSocket connections can't set headers — accept ?token= query param
  const query = req.query as Record<string, string>
  if (query.token && timingSafeEqual(query.token, config.authToken)) return

  // Standard Bearer token for REST
  const header = req.headers.authorization
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7)
    if (timingSafeEqual(token, config.authToken)) return
  }

  return reply.code(401).send({ error: "Unauthorized" })
}

// Constant-time comparison to prevent timing attacks on token comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b))
}
