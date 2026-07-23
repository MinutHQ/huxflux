import * as crypto from "node:crypto"
import type { ProxyToken } from "@huxflux/shared/proxy"

// Pending auth sessions live in memory only. They are short-lived (10 min) and
// single-use; a proxy restart mid-flow just means the user re-authenticates.
// Refresh tokens, which must survive restarts, live in the on-disk DB instead.

export interface AuthSession {
  authId: string
  state: string
  status: "pending" | "authorized" | "denied"
  expiresAt: number
  token?: ProxyToken
}

const SESSION_TTL_MS = 10 * 60 * 1000
/** Poll interval (seconds) advertised to clients. */
export const POLL_INTERVAL_SEC = 2

const byId = new Map<string, AuthSession>()
const byState = new Map<string, string>()

function prune(): void {
  const now = Date.now()
  for (const [id, s] of byId) {
    if (s.expiresAt <= now) {
      byId.delete(id)
      byState.delete(s.state)
    }
  }
}

export function createSession(): AuthSession {
  prune()
  const session: AuthSession = {
    authId: crypto.randomUUID(),
    state: crypto.randomBytes(24).toString("base64url"),
    status: "pending",
    expiresAt: Date.now() + SESSION_TTL_MS,
  }
  byId.set(session.authId, session)
  byState.set(session.state, session.authId)
  return session
}

export const SESSION_TTL_SEC = SESSION_TTL_MS / 1000

export function getSession(authId: string): AuthSession | null {
  const s = byId.get(authId)
  if (!s) return null
  if (s.expiresAt <= Date.now()) { byId.delete(authId); byState.delete(s.state); return null }
  return s
}

export function getSessionByState(state: string): AuthSession | null {
  const id = byState.get(state)
  return id ? getSession(id) : null
}

export function authorizeSession(state: string, token: ProxyToken): AuthSession | null {
  const s = getSessionByState(state)
  if (!s) return null
  s.status = "authorized"
  s.token = token
  return s
}

export function denySession(state: string): void {
  const s = getSessionByState(state)
  if (s) s.status = "denied"
}

/** Read an authorized session's token and destroy the session (one-time use). */
export function consumeToken(authId: string): ProxyToken | null {
  const s = getSession(authId)
  if (!s || s.status !== "authorized" || !s.token) return null
  byId.delete(s.authId)
  byState.delete(s.state)
  return s.token
}
