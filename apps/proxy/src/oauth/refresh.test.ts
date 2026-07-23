import { describe, it, expect } from "vitest"
import { issueRefreshToken, emailForRefreshToken, revokeRefreshToken } from "./refresh.js"

describe("refresh tokens", () => {
  it("issues a token, resolves its owner, and revokes it", () => {
    const token = issueRefreshToken("bob@minut.com")
    expect(token.length).toBeGreaterThan(20)
    expect(emailForRefreshToken(token)).toBe("bob@minut.com")
    revokeRefreshToken(token)
    expect(emailForRefreshToken(token)).toBeNull()
  })

  it("returns null for an unknown token", () => {
    expect(emailForRefreshToken("never-issued")).toBeNull()
  })

  it("issues distinct tokens per call", () => {
    expect(issueRefreshToken("c@minut.com")).not.toBe(issueRefreshToken("c@minut.com"))
  })
})
