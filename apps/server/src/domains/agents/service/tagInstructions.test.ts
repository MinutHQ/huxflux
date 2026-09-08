import { describe, expect, it } from "vitest"
import { buildChatTagInstructions, buildNamingTurnContext, PLACEHOLDER_NOTE_PREFIX } from "./tagInstructions.js"

const baseArgs = {
  branchPrefix: "ai",
  isFolderAgent: false,
  agentId: "agent-1",
  threadParentId: null,
  forkParentId: null,
  hasPrNumber: false,
  availableRepos: ["huxflux"],
}

describe("buildChatTagInstructions", () => {
  it("documents the naming tags and points at the per-turn note", () => {
    const out = buildChatTagInstructions(baseArgs)
    expect(out).toContain("<huxflux:agents.title>")
    expect(out).toContain("<huxflux:agents.branch>")
    expect(out).toContain(PLACEHOLDER_NOTE_PREFIX)
    expect(out).toContain('the prefix "ai/" is added automatically')
  })

  it("only documents the title tag for folder agents", () => {
    const out = buildChatTagInstructions({ ...baseArgs, isFolderAgent: true, branchPrefix: null })
    expect(out).toContain("<huxflux:agents.title>")
    expect(out).not.toContain("<huxflux:agents.branch>kebab")
  })

  it("does not embed anything that changes when the agent is renamed", () => {
    const out = buildChatTagInstructions(baseArgs)
    expect(out).not.toMatch(/e\.g\. "/)
  })
})

describe("buildNamingTurnContext", () => {
  it("returns a note naming both placeholders while title and branch are random", () => {
    const note = buildNamingTurnContext({
      title: "dawnlit-carver-mu6rh",
      branch: "ai/dawnlit-carver-mu6rh",
      branchPrefix: "ai",
      isFolderAgent: false,
    })
    expect(note).not.toBeNull()
    expect(note).toContain(PLACEHOLDER_NOTE_PREFIX)
    expect(note).toContain('"dawnlit-carver-mu6rh"')
    expect(note).toContain('"ai/dawnlit-carver-mu6rh"')
    expect(note).toContain("both naming tags")
  })

  it("still notes when only the branch is a placeholder", () => {
    const note = buildNamingTurnContext({
      title: "Fix login bug",
      branch: "ai/dawnlit-carver-mu6rh",
      branchPrefix: "ai",
      isFolderAgent: false,
    })
    expect(note).not.toBeNull()
  })

  it("returns null once both names are real so the model stops renaming", () => {
    const note = buildNamingTurnContext({
      title: "Fix login bug",
      branch: "ai/fix-login-bug",
      branchPrefix: "ai",
      isFolderAgent: false,
    })
    expect(note).toBeNull()
  })

  it("ignores the branch for folder agents", () => {
    expect(buildNamingTurnContext({ title: "Explain repo", branch: null, branchPrefix: null, isFolderAgent: true })).toBeNull()
    const note = buildNamingTurnContext({ title: "dawnlit-carver-mu6rh", branch: null, branchPrefix: null, isFolderAgent: true })
    expect(note).toContain("naming tag in this response")
    expect(note).not.toContain("branch")
  })
})
