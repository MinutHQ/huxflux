import { describe, expect, it } from "vitest"
import { redactUrl } from "./audit.js"

describe("redactUrl", () => {
  it("masks token and proxy_token query values", () => {
    expect(redactUrl("/api/agents/a/attachments/x.png?token=secret")).toBe("/api/agents/a/attachments/x.png?token=***")
    expect(redactUrl("/ws?a=1&proxy_token=jwt.abc&b=2")).toBe("/ws?a=1&proxy_token=***&b=2")
  })

  it("leaves other params and plain paths alone", () => {
    expect(redactUrl("/api/agents?mytoken=keep")).toBe("/api/agents?mytoken=keep")
    expect(redactUrl("/api/agents")).toBe("/api/agents")
  })
})
