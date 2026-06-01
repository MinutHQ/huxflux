// Global Fastify error handler. Every error that flows through Fastify's
// error pipeline gets normalised into the shared `apiErrorSchema` shape
// (`{ code, message, details? }`) before being sent to the client.
//
// Routes that already call `reply.code(N).send({ error: "..." })` directly
// bypass this handler (they're explicit replies, not errors). The client's
// `req()` wrapper handles both shapes; the legacy `{ error }` path will
// disappear as routes are migrated.

import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify"
import { ZodError } from "zod/v4"
import { HuxfluxApiError } from "@huxflux/shared"
import * as path from "node:path"
import * as fs from "node:fs"
import { fileURLToPath } from "node:url"

interface NormalisedError {
  status: number
  code: string
  message: string
  details?: unknown
}

function normaliseError(err: FastifyError | Error): NormalisedError {
  if (err instanceof HuxfluxApiError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details }
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "validation.failed",
      message: "Request validation failed",
      details: err.issues,
    }
  }
  const fastifyErr = err as FastifyError
  // Fastify validation errors carry `validation` and a 400 statusCode.
  if (fastifyErr.validation) {
    return {
      status: fastifyErr.statusCode ?? 400,
      code: "validation.failed",
      message: fastifyErr.message,
      details: fastifyErr.validation,
    }
  }
  const status = fastifyErr.statusCode ?? 500
  if (status === 401) {
    return { status, code: "auth.unauthorized", message: err.message || "Unauthorized" }
  }
  if (status === 403) {
    return { status, code: "auth.forbidden", message: err.message || "Forbidden" }
  }
  if (status === 404) {
    return { status, code: "not_found", message: err.message || "Not Found" }
  }
  if (status >= 400 && status < 500) {
    return { status, code: "request.bad", message: err.message || "Bad Request" }
  }
  return { status, code: "server.internal", message: err.message || "Internal Server Error" }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const out = normaliseError(err)
    if (out.status >= 500) req.log.error({ err }, "request failed")
    else req.log.warn({ err: { message: err.message, name: err.name } }, "request error")
    reply.code(out.status).header("Content-Type", "application/json").send({
      code: out.code,
      message: out.message,
      ...(out.details !== undefined ? { details: out.details } : {}),
    })
  })

  // SPA fallback: serve index.html for non-API routes when web UI is bundled
  const indexHtml = path.join(path.dirname(fileURLToPath(import.meta.url)), "web", "index.html")
  const webBundled = fs.existsSync(indexHtml)
  const indexContent = webBundled ? fs.readFileSync(indexHtml, "utf8") : null

  app.setNotFoundHandler((req, reply) => {
    const isApi = req.url.startsWith("/api/") || req.url.startsWith("/ws") || req.url.startsWith("/docs")
    if (!isApi && indexContent) {
      return reply.code(200).header("Content-Type", "text/html").send(indexContent)
    }
    reply.code(404).header("Content-Type", "application/json").send({
      code: "not_found",
      message: "Route not found",
    })
  })
}
