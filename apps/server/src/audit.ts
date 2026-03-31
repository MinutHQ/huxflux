/**
 * Request audit log — writes one line per authenticated request to
 * ~/.huxflux/audit.log so users can review who did what and when.
 *
 * Format (newline-delimited JSON):
 *   { "t": <ISO timestamp>, "method": "POST", "url": "/api/agents/…/messages", "ip": "…", "status": 200 }
 *
 * Only requests that pass authentication are logged (health check skipped).
 * The log is appended — rotate manually or with logrotate if needed.
 */

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { FastifyInstance } from "fastify"

const AUDIT_LOG = path.join(os.homedir(), ".huxflux", "audit.log")
const SKIP_PATHS = new Set(["/health"])

export function registerAuditLog(app: FastifyInstance) {
  // Write a log entry after each response
  app.addHook("onResponse", async (req, reply) => {
    const url = req.routeOptions?.url ?? req.url
    if (SKIP_PATHS.has(url)) return

    const entry = JSON.stringify({
      t: new Date().toISOString(),
      method: req.method,
      url: req.url,
      ip: req.ip,
      status: reply.statusCode,
    })

    try {
      fs.appendFileSync(AUDIT_LOG, entry + "\n")
    } catch {
      // Non-fatal — don't crash the server if audit log write fails
    }
  })
}
