import type { IncomingMessage } from "node:http"
import { config } from "./config.js"

// Pluggable auth hooks. Deliberately permissive by default — real credential
// management (per-server secrets, client identity) is deferred. When the
// corresponding env var is set the check is enforced, so the wiring is proven
// end-to-end without committing to a credential store yet.

/** Called on every server registration with the secret from the register frame. */
export function authenticateServer(secret: string | undefined): boolean {
  if (!config.serverSecret) return true
  return secret === config.serverSecret
}

/** Called on every client request / upgrade before it is tunneled. */
export function authorizeClient(req: IncomingMessage): boolean {
  if (!config.clientToken) return true
  // Accept a bearer header (REST) or a ?token= query param (WebSocket upgrades,
  // which cannot set headers) — mirrors how the Huxflux server itself reads a
  // token. This only gates access to the proxy; the tunneled request still
  // carries the target server's own token for the server to validate.
  const header = req.headers.authorization
  if (header?.startsWith("Bearer ") && header.slice(7) === config.clientToken) return true
  try {
    const url = new URL(req.url ?? "/", "http://localhost")
    if (url.searchParams.get("token") === config.clientToken) return true
  } catch {
    /* malformed url → unauthorized */
  }
  return false
}
