import { describe, expect, it } from "vitest"
import { prStatusToAgentStatus } from "./prStatus.js"
import type { PRStatus } from "../../../types.js"

function pr(overrides: Partial<PRStatus> = {}): PRStatus {
  return {
    number: 1,
    url: "https://github.com/o/r/pull/1",
    state: "open",
    merged: false,
    draft: false,
    mergeableState: "clean",
    hasChangeRequests: false,
    ...overrides,
  }
}

describe("prStatusToAgentStatus", () => {
  it("maps a draft PR to draft-pr", () => {
    expect(prStatusToAgentStatus(pr({ draft: true }))).toBe("draft-pr")
  })

  it("maps an open non-draft PR to in-review", () => {
    expect(prStatusToAgentStatus(pr())).toBe("in-review")
  })

  it("maps a merged PR to done regardless of draft flag", () => {
    expect(prStatusToAgentStatus(pr({ merged: true, draft: true }))).toBe("done")
  })

  it("maps a closed PR to cancelled", () => {
    expect(prStatusToAgentStatus(pr({ state: "closed" }))).toBe("cancelled")
  })
})
