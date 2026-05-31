import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "../../../../test/harness.js"
import { buildSystemPrompt } from "./systemPrompt.js"
import type { ProviderAdapter } from "../../providers/providers.types.js"

function fakeProvider(planMode: boolean): ProviderAdapter {
  return {
    id: "claude",
    name: "Claude",
    capabilities: {
      sessionResume: true, sessionContinue: true, planMode, streamingJson: true,
      toolUseEvents: true, thinkingBlocks: true, askUserQuestion: true,
      systemPromptFlag: true, allowedToolsRestriction: true, subAgentSupport: true,
      effortLevels: [],
    },
    resolveBinary: () => "claude",
    isAvailable: () => true,
    buildSpawnArgs: () => ({ bin: "", args: [] }),
    parseStreamLine: () => null,
    resolveModel: (m) => m,
    getModels: () => [],
  }
}

describe("buildSystemPrompt", () => {
  let testDb: TestDb
  beforeEach(() => { testDb = createTestDb() })
  afterEach(() => { testDb.close() })

  it("returns the refine prompt when taskContext is provided", () => {
    const out = buildSystemPrompt({
      agentId: "a", agent: null, repo: null, planMode: false,
      taskContext: "Refine the spec for task XYZ.", provider: fakeProvider(false),
    })
    expect(out).toContain("Huxflux refinement assistant")
    expect(out).toContain("Refine the spec for task XYZ.")
    expect(out).not.toContain("Quality checks")
  })

  it("includes the agent identity line and quality-checks scaffolding", () => {
    const out = buildSystemPrompt({
      agentId: "agent-1",
      agent: { id: "agent-1", title: "dawnlit-carver-mu6rh", branch: "wip/x", prNumber: null, threadParentId: null },
      repo: { branchPrefix: null },
      planMode: false,
      provider: fakeProvider(false),
    })
    expect(out).toContain("dawnlit-carver-mu6rh")
    expect(out).toContain("wip/x")
    expect(out).toContain("Quality checks")
  })

  it("emits zero hardcoded tag instructions (the caller owns them)", () => {
    const out = buildSystemPrompt({
      agentId: "agent-1",
      agent: { id: "agent-1", title: "t", branch: "b", prNumber: null, threadParentId: null },
      repo: { branchPrefix: "ai" },
      planMode: false,
      provider: fakeProvider(false),
    })
    expect(out).not.toContain("<huxflux:")
  })

  it("splices in tagInstructions verbatim when provided", () => {
    const out = buildSystemPrompt({
      agentId: "agent-1",
      agent: { id: "agent-1", title: "t", branch: "b", prNumber: null, threadParentId: null },
      repo: null,
      planMode: false,
      tagInstructions: "Emit <huxflux:agents.title>...</huxflux:agents.title> on the first turn.",
      provider: fakeProvider(false),
    })
    expect(out).toContain("Emit <huxflux:agents.title>")
  })

  it("adds the plan-mode addendum only when planMode is true and provider supports it", () => {
    const withPlan = buildSystemPrompt({
      agentId: "a",
      agent: { id: "a", title: "t", branch: "b", prNumber: null, threadParentId: null },
      repo: null, planMode: true, provider: fakeProvider(true),
    })
    expect(withPlan).toContain("plan mode")

    const withoutPlan = buildSystemPrompt({
      agentId: "a",
      agent: { id: "a", title: "t", branch: "b", prNumber: null, threadParentId: null },
      repo: null, planMode: false, provider: fakeProvider(true),
    })
    expect(withoutPlan).not.toContain("plan mode")
  })

  it("identifies folder-style agents in the intro line", () => {
    const out = buildSystemPrompt({
      agentId: "agent-1",
      agent: { id: "agent-1", title: "dawnlit-carver-mu6rh", branch: "", prNumber: null, threadParentId: null },
      repo: { branchPrefix: null, type: "folder" },
      planMode: false,
      provider: fakeProvider(false),
    })
    expect(out).toContain("working directly in a folder")
  })
})
