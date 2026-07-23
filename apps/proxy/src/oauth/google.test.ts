import { describe, it, expect } from "vitest"
import { isDomainAllowed, buildGoogleAuthUrl, redirectUri } from "./google.js"

describe("google identity gate", () => {
  it("allows only configured domains, case-insensitively", () => {
    expect(isDomainAllowed("minut.com")).toBe(true)
    expect(isDomainAllowed("MINUT.COM")).toBe(true)
    expect(isDomainAllowed("example.com")).toBe(true)
    expect(isDomainAllowed("evil.com")).toBe(false)
    expect(isDomainAllowed("")).toBe(false)
  })

  it("builds a Google consent URL carrying state + redirect_uri", () => {
    const url = new URL(buildGoogleAuthUrl("state-123"))
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(url.searchParams.get("state")).toBe("state-123")
    expect(url.searchParams.get("client_id")).toBe("test-client-id")
    expect(url.searchParams.get("scope")).toBe("openid email")
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri())
  })

  it("derives the redirect URI from the public URL", () => {
    expect(redirectUri()).toBe("https://proxy.test/oauth/callback")
  })
})
