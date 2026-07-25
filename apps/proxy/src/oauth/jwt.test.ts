import { describe, it, expect } from "vitest"
import { signAccessToken, verifyAccessToken } from "./jwt.js"

describe("access token JWT", () => {
  it("signs and verifies, recovering the email", async () => {
    const { token, expiresIn } = await signAccessToken("alice@minut.com")
    expect(expiresIn).toBeGreaterThan(0)
    expect(await verifyAccessToken(token)).toBe("alice@minut.com")
  })

  it("rejects a token with a tampered signature", async () => {
    const { token } = await signAccessToken("alice@minut.com")
    const parts = token.split(".")
    parts[2] = parts[2] === "AAAAAAAA" ? "BBBBBBBB" : "AAAAAAAA"
    expect(await verifyAccessToken(parts.join("."))).toBeNull()
  })

  it("rejects garbage and empty input", async () => {
    expect(await verifyAccessToken("not.a.jwt")).toBeNull()
    expect(await verifyAccessToken("")).toBeNull()
  })
})
