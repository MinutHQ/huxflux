import { describe, expect, it } from "vitest"
import { agentSdkProvider, buildPromptStream, buildQueryOptions } from "./agentSdk.js"
import type { PermissionDecision, PermissionRequest, SpawnOptions } from "../providers.types.js"
import { claudeContinueProbePath, claudeSessionFilePath } from "./claudeSessionPaths.js"

function baseOpts(overrides: Partial<SpawnOptions> = {}): SpawnOptions {
  return {
    prompt: "do the thing",
    model: "claude-sonnet-4-6",
    planMode: false,
    sessionId: null,
    isContinuation: false,
    cwd: "/tmp/work",
    systemPrompt: "sys",
    ...overrides,
  }
}

const ctx = {
  env: { HUXFLUX_AGENT_ID: "a1" },
  onStderr: () => { /* noop */ },
  requestPermission: async (_request: PermissionRequest): Promise<PermissionDecision> => ({ behavior: "deny", message: "test" }),
}

async function* injected(...texts: string[]): AsyncIterable<string> {
  for (const t of texts) yield t
}

describe("buildQueryOptions", () => {
  it("appends the system prompt to the claude_code preset and loads the CLI's setting sources", () => {
    const options = buildQueryOptions(baseOpts(), "claude-sonnet-4-6", ctx, new AbortController())
    expect(options.systemPrompt).toEqual({ type: "preset", preset: "claude_code", append: "sys" })
    expect(options.settingSources).toEqual(["user", "project", "local"])
    expect(options.cwd).toBe("/tmp/work")
    expect(options.model).toBe("claude-sonnet-4-6")
    expect(options.env).toEqual({ HUXFLUX_AGENT_ID: "a1" })
  })

  it("bypasses permissions outside plan mode and opts into the safety flag", () => {
    const options = buildQueryOptions(baseOpts(), "m", ctx, new AbortController())
    expect(options.permissionMode).toBe("bypassPermissions")
    expect(options.allowDangerouslySkipPermissions).toBe(true)
  })

  it("uses plan mode without the bypass flag when planMode is set", () => {
    const options = buildQueryOptions(baseOpts({ planMode: true }), "m", ctx, new AbortController())
    expect(options.permissionMode).toBe("plan")
    expect(options.allowDangerouslySkipPermissions).toBe(false)
  })

  it("resumes by session id and never also sets continue", () => {
    const options = buildQueryOptions(baseOpts({ sessionId: "sess-1", isContinuation: true }), "m", ctx, new AbortController())
    expect(options.resume).toBe("sess-1")
    expect(options.continue).toBeUndefined()
  })

  it("falls back to continue when there is no session id but the turn continues", () => {
    const options = buildQueryOptions(baseOpts({ isContinuation: true }), "m", ctx, new AbortController())
    expect(options.resume).toBeUndefined()
    expect(options.continue).toBe(true)
  })

  it("passes only known effort levels through", () => {
    expect(buildQueryOptions(baseOpts({ effort: "xhigh" }), "m", ctx, new AbortController()).effort).toBe("xhigh")
    expect(buildQueryOptions(baseOpts({ effort: "turbo" }), "m", ctx, new AbortController()).effort).toBeUndefined()
    expect(buildQueryOptions(baseOpts(), "m", ctx, new AbortController()).effort).toBeUndefined()
  })

  it("always allows AskUserQuestion on top of the requested tools, like the CLI adapter", () => {
    expect(buildQueryOptions(baseOpts(), "m", ctx, new AbortController()).allowedTools).toEqual(["AskUserQuestion"])
    expect(buildQueryOptions(baseOpts({ allowedTools: ["Read", "Edit"] }), "m", ctx, new AbortController()).allowedTools).toEqual(["Read", "Edit", "AskUserQuestion"])
  })

  it("routes canUseTool to the host's requestPermission and forwards sub-agent text", async () => {
    const seen: PermissionRequest[] = []
    const options = buildQueryOptions(baseOpts(), "m", {
      ...ctx,
      requestPermission: async (request) => { seen.push(request); return { behavior: "allow", updatedInput: { ok: true } } },
    }, new AbortController())
    expect(options.forwardSubagentText).toBe(true)
    const signal = new AbortController().signal
    const decision = await options.canUseTool!("AskUserQuestion", { questions: [] }, { signal, toolUseID: "tu-7", requestId: "r-1" })
    expect(decision).toEqual({ behavior: "allow", updatedInput: { ok: true } })
    expect(seen).toEqual([{ toolName: "AskUserQuestion", input: { questions: [] }, toolUseId: "tu-7", signal }])
  })

  it("wires the abort controller the caller owns", () => {
    const abort = new AbortController()
    expect(buildQueryOptions(baseOpts(), "m", ctx, abort).abortController).toBe(abort)
  })
})

describe("agentSdkProvider", () => {
  it("is registered as agent-sdk, resolvable, and available", () => {
    expect(agentSdkProvider.id).toBe("agent-sdk")
    expect(agentSdkProvider.isAvailable()).toBe(true)
    expect(agentSdkProvider.resolveBinary()).toContain("claude-agent-sdk")
    expect(typeof agentSdkProvider.runTurn).toBe("function")
  })

  it("refuses buildSpawnArgs because the turn runs in-process", () => {
    expect(() => agentSdkProvider.buildSpawnArgs(baseOpts())).toThrow(/in-process/)
  })

  it("resolves display names, passes API ids through, and defaults otherwise", () => {
    expect(agentSdkProvider.resolveModel("Opus 5")).toBe("claude-opus-5")
    expect(agentSdkProvider.resolveModel("claude-custom-1")).toBe("claude-custom-1")
    expect(agentSdkProvider.resolveModel("")).toBe("claude-sonnet-4-6")
    expect(agentSdkProvider.resolveModel("gpt-9")).toBe("claude-sonnet-4-6")
  })

  it("advertises effort levels on every model", () => {
    const models = agentSdkProvider.getModels()
    expect(models.length).toBeGreaterThan(0)
    for (const m of models) {
      expect(m.effortLevels).toEqual(["low", "medium", "high", "xhigh", "max"])
      expect(m.defaultEffort).toBe("high")
    }
  })

  it("parses a serialized SDK message line into its first normalized event", () => {
    const line = JSON.stringify({ type: "system", subtype: "init", session_id: "s-9", uuid: "u", parent_tool_use_id: null })
    expect(agentSdkProvider.parseStreamLine(line)).toEqual({ type: "session_init", sessionId: "s-9" })
  })

  it("returns null for malformed JSON and unknown message types", () => {
    expect(agentSdkProvider.parseStreamLine("{nope")).toBeNull()
    expect(agentSdkProvider.parseStreamLine(JSON.stringify({ type: "wat" }))).toBeNull()
  })

  it("shares the claude CLI's session transcript layout", () => {
    expect(agentSdkProvider.sessionFilePath?.("/repo/x", "abc")).toBe(claudeSessionFilePath("/repo/x", "abc"))
    expect(agentSdkProvider.continueProbePath?.("/repo/x")).toBe(claudeContinueProbePath("/repo/x"))
  })

  it("ends immediately when the signal is already aborted", async () => {
    const abort = new AbortController()
    abort.abort()
    const seen: unknown[] = []
    for await (const ev of agentSdkProvider.runTurn!(baseOpts(), { ...ctx, signal: abort.signal, env: {}, userMessages: injected() })) seen.push(ev)
    expect(seen).toEqual([])
  })
})

describe("buildPromptStream", () => {
  it("yields the initial prompt, then every injected message, then ends", async () => {
    const out: string[] = []
    for await (const m of buildPromptStream("first", injected("second", "third"))) {
      expect(m.type).toBe("user")
      expect(m.parent_tool_use_id).toBeNull()
      const content = m.message.content as Array<{ type: string; text: string }>
      out.push(content[0]!.text)
    }
    expect(out).toEqual(["first", "second", "third"])
  })
})
