import { describe, it, expect } from "vitest"
import { createSession, getSession, authorizeSession, denySession, consumeToken } from "./sessions.js"

const token = { accessToken: "a", refreshToken: "r", email: "carol@minut.com", expiresIn: 3600 }

describe("auth sessions", () => {
  it("starts pending, authorizes by state, and yields the token exactly once", () => {
    const s = createSession()
    expect(getSession(s.authId)?.status).toBe("pending")

    authorizeSession(s.state, token)
    expect(getSession(s.authId)?.status).toBe("authorized")

    expect(consumeToken(s.authId)).toEqual(token)
    // One-time: the session is destroyed after the token is read.
    expect(consumeToken(s.authId)).toBeNull()
    expect(getSession(s.authId)).toBeNull()
  })

  it("marks a session denied", () => {
    const s = createSession()
    denySession(s.state)
    expect(getSession(s.authId)?.status).toBe("denied")
    expect(consumeToken(s.authId)).toBeNull()
  })

  it("returns null for an unknown session id", () => {
    expect(getSession("does-not-exist")).toBeNull()
  })

  it("gives each session a distinct id and state", () => {
    const a = createSession()
    const b = createSession()
    expect(a.authId).not.toBe(b.authId)
    expect(a.state).not.toBe(b.state)
  })
})
