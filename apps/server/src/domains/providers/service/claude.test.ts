import { describe, expect, it } from "vitest"
import { claudeProvider } from "./claude.js"
import type { SpawnOptions } from "../providers.types.js"

/**
 * Unit tests for claudeProvider.buildSpawnArgs.
 *
 * The Claude CLI runs in stream-json input mode: the prompt travels over
 * stdin (stdinInit), NOT argv, and `--permission-prompt-tool stdio` must be
 * present or the CLI strips AskUserQuestion from the tool set in print mode.
 */

function baseOpts(overrides: Partial<SpawnOptions> = {}): SpawnOptions {
  return {
    prompt: "do the thing",
    model: "claude-sonnet-4-6",
    planMode: false,
    sessionId: null,
    isContinuation: false,
    cwd: "/tmp",
    systemPrompt: "sys",
    ...overrides,
  }
}

describe("claudeProvider.buildSpawnArgs", () => {
  it("uses stream-json input mode with the stdio permission prompt tool", () => {
    const { args } = claudeProvider.buildSpawnArgs(baseOpts())
    expect(args).toContain("--input-format")
    expect(args[args.indexOf("--input-format") + 1]).toBe("stream-json")
    expect(args).toContain("--permission-prompt-tool")
    expect(args[args.indexOf("--permission-prompt-tool") + 1]).toBe("stdio")
    expect(args).toContain("--dangerously-skip-permissions")
  })

  it("puts the prompt in stdinInit as a stream-json user message, not argv", () => {
    const { args, stdinInit } = claudeProvider.buildSpawnArgs(baseOpts())
    expect(args).not.toContain("do the thing")
    expect(stdinInit).toBeDefined()
    expect(JSON.parse(stdinInit!)).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "do the thing" }] },
    })
  })

  it("always allows AskUserQuestion alongside caller-provided allowed tools", () => {
    const { args } = claudeProvider.buildSpawnArgs(baseOpts({ allowedTools: ["Bash", "Read"] }))
    const allowed = args[args.indexOf("--allowedTools") + 1]
    expect(allowed).toBe("Bash,Read,AskUserQuestion")
  })

  it("uses plan permission mode instead of skip-permissions in plan mode", () => {
    const { args } = claudeProvider.buildSpawnArgs(baseOpts({ planMode: true }))
    expect(args).toContain("--permission-mode")
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("plan")
    expect(args).not.toContain("--dangerously-skip-permissions")
  })

  it("passes --resume for a session id and --continue for a continuation", () => {
    const resumed = claudeProvider.buildSpawnArgs(baseOpts({ sessionId: "sess-1" }))
    expect(resumed.args).toContain("--resume")
    expect(resumed.args[resumed.args.indexOf("--resume") + 1]).toBe("sess-1")

    const continued = claudeProvider.buildSpawnArgs(baseOpts({ isContinuation: true }))
    expect(continued.args).toContain("--continue")
  })
})
