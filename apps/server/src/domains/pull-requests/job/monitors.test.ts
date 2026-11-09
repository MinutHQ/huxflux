import { describe, expect, it, vi } from "vitest"
import type { PRDetails, PRIssueComment } from "../../../types.js"
import { collectNewComments } from "./monitors.js"

vi.mock("../../agent-runner/agent-runner.service.js", () => ({ isAgentRunning: vi.fn(() => false) }))
vi.mock("./sendToAgent.js", () => ({ sendToAgent: vi.fn() }))

type AgentArg = Parameters<typeof collectNewComments>[0]

const OPLANE_CLEAN = "<!-- oplane-security-review:oplane-bot:results -->\nAll requirements are satisfied."
const OPLANE_FINDING = "<!-- oplane-security-review:oplane-bot:results -->\nfinding that **1 requirement needs attention**."

function comment(id: number, author: string, body: string): PRIssueComment {
  return { id, author, body, createdAt: "", url: "" }
}

function details(issueComments: PRIssueComment[]): PRDetails {
  return { author: "viktor", threads: [], issueComments } as unknown as PRDetails
}

describe("collectNewComments bot noise", () => {
  it("drops no-op bot comments but forwards human ones", () => {
    const agent = { id: "a-noise" } as AgentArg
    expect(collectNewComments(agent, details([]))).toBe("seeded")
    const out = collectNewComments(agent, details([
      comment(1, "oplane-bot[bot]", OPLANE_CLEAN),
      comment(2, "github-actions[bot]", "No new findings."),
      comment(3, "reviewer", "please rename this"),
    ]))
    expect(out).toEqual([{ author: "reviewer", body: "please rename this", commentId: 3 }])
  })

  it("forwards a no-op bot comment once it is edited into a finding", () => {
    const agent = { id: "a-edit" } as AgentArg
    expect(collectNewComments(agent, details([comment(10, "oplane-bot[bot]", OPLANE_CLEAN)]))).toBe("seeded")
    expect(collectNewComments(agent, details([comment(10, "oplane-bot[bot]", OPLANE_CLEAN)]))).toEqual([])
    const out = collectNewComments(agent, details([comment(10, "oplane-bot[bot]", OPLANE_FINDING)]))
    expect(out).toEqual([{ author: "oplane-bot[bot]", body: OPLANE_FINDING, commentId: 10 }])
    // Forwarded once only.
    expect(collectNewComments(agent, details([comment(10, "oplane-bot[bot]", OPLANE_FINDING)]))).toEqual([])
  })
})
