import { describe, expect, it } from "vitest"
import { piProvider, parseListModelsTable } from "./pi.js"

/**
 * Unit tests for piProvider.
 *
 * pi streams JSONL in `--mode json`. The shapes we care about:
 *   session (header), message_update (text_delta / thinking_delta / toolcall_end),
 *   tool_execution_end, message_end (usage + error), extension_error
 *
 * `message_update` is delta-only (no cumulative message); `toolcall_end` carries
 * the full call and its `toolCall.id` matches the later `toolCallId`.
 */
describe("piProvider.parseStreamLine", () => {
  it("parses the session header into session_init", () => {
    const raw = JSON.stringify({ type: "session", version: 3, id: "sess-pi-1", cwd: "/x" })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "session_init", sessionId: "sess-pi-1" })
  })

  it("parses a text_delta into a text event", () => {
    const raw = JSON.stringify({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello " },
    })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "text", text: "Hello " })
  })

  it("parses a thinking_delta into a thinking event", () => {
    const raw = JSON.stringify({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "hmm" },
    })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "thinking", text: "hmm" })
  })

  it("ignores non-semantic message_update delta types (start/end)", () => {
    const raw = JSON.stringify({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    })
    expect(piProvider.parseStreamLine(raw)).toBeNull()
  })

  it("parses a toolcall_end into a tool_use event", () => {
    const raw = JSON.stringify({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 1,
        toolCall: { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "ls" } },
      },
    })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "tool_use", id: "call-1", name: "bash", input: { command: "ls" } })
  })

  it("parses a tool_execution_end into a tool_result event", () => {
    const raw = JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "bash",
      result: { content: [{ type: "text", text: "total 48\n" }] },
      isError: false,
    })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "tool_result", toolUseId: "call-1", content: "total 48\n" })
  })

  it("joins multiple text blocks in a tool result", () => {
    const raw = JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "call-2",
      result: { content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] },
    })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "tool_result", toolUseId: "call-2", content: "ab" })
  })

  it("parses an assistant message_end with usage into a usage event", () => {
    const raw = JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        usage: { input: 100, output: 40, cacheRead: 10, cacheWrite: 0, totalTokens: 150 },
        stopReason: "stop",
      },
    })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "usage",
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 0,
    })
  })

  it("ignores a user message_end", () => {
    const raw = JSON.stringify({ type: "message_end", message: { role: "user", content: [] } })
    expect(piProvider.parseStreamLine(raw)).toBeNull()
  })

  it("parses an assistant message_end with stopReason=error into an error event", () => {
    const raw = JSON.stringify({
      type: "message_end",
      message: { role: "assistant", stopReason: "error", errorMessage: "rate limited" },
    })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "error", message: "rate limited" })
  })

  it("parses an extension_error into an error event", () => {
    const raw = JSON.stringify({ type: "extension_error", extensionPath: "/e.ts", error: "boom" })
    const event = piProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "error", message: "boom" })
  })

  it("returns null for malformed JSON", () => {
    expect(piProvider.parseStreamLine("not-json")).toBeNull()
  })

  it("returns null for an unknown event type", () => {
    expect(piProvider.parseStreamLine(JSON.stringify({ type: "agent_settled" }))).toBeNull()
  })
})

describe("parseListModelsTable", () => {
  it("parses the fixed-width table into provider/id model entries", () => {
    const raw = [
      "provider   model              context  max-out  thinking  images",
      "anthropic  claude-sonnet-4-6  200K     64K      yes       yes",
      "openai     gpt-5              400K     128K     yes       no",
    ].join("\n")
    const out = parseListModelsTable(raw)
    expect(out).toEqual([
      { id: "anthropic/claude-sonnet-4-6", label: "claude-sonnet-4-6", api: "anthropic/claude-sonnet-4-6" },
      { id: "openai/gpt-5", label: "gpt-5", api: "openai/gpt-5" },
    ])
  })

  it("handles a provider column containing slashes and colons", () => {
    const raw = [
      "provider                            model                           context  max-out  thinking  images",
      "llama-server=http://127.0.0.1:8080  ggml-org/Qwen3.8-27B-GGUF:Q8_0  262.1K   262.1K   yes       yes",
    ].join("\n")
    const out = parseListModelsTable(raw)
    expect(out).toEqual([
      {
        id: "llama-server=http://127.0.0.1:8080/ggml-org/Qwen3.8-27B-GGUF:Q8_0",
        label: "ggml-org/Qwen3.8-27B-GGUF:Q8_0",
        api: "llama-server=http://127.0.0.1:8080/ggml-org/Qwen3.8-27B-GGUF:Q8_0",
      },
    ])
  })

  it("returns an empty array for header-only or empty input", () => {
    expect(parseListModelsTable("")).toEqual([])
    expect(parseListModelsTable("provider   model   context")).toEqual([])
  })
})

describe("piProvider.resolveModel", () => {
  it("returns an anthropic model by default", () => {
    // Uses the static fallback catalog (no discovery in the test process).
    const model = piProvider.resolveModel("")
    expect(model.startsWith("anthropic/")).toBe(true)
  })

  it("passes through unknown ids verbatim", () => {
    expect(piProvider.resolveModel("openai/some-future-model")).toBe("openai/some-future-model")
  })
})

describe("piProvider.buildSpawnArgs", () => {
  it("builds a one-shot json spawn with model, system prompt, and prompt", () => {
    const result = piProvider.buildSpawnArgs({
      prompt: "do the thing",
      model: "anthropic/claude-sonnet-4-6",
      planMode: false,
      sessionId: null,
      isContinuation: false,
      cwd: "/w",
      systemPrompt: "you are huxflux",
    })
    expect(result.args).toEqual([
      "--mode", "json", "--print",
      "--model", "anthropic/claude-sonnet-4-6",
      "--append-system-prompt", "you are huxflux",
      "--", "do the thing",
    ])
  })

  it("resumes an existing session by id", () => {
    const result = piProvider.buildSpawnArgs({
      prompt: "again",
      model: "",
      planMode: false,
      sessionId: "sess-123",
      isContinuation: false,
      cwd: "/w",
      systemPrompt: "",
    })
    expect(result.args).toContain("--session-id")
    expect(result.args[result.args.indexOf("--session-id") + 1]).toBe("sess-123")
  })

  it("maps a valid effort to --thinking and prepends conversation context", () => {
    const result = piProvider.buildSpawnArgs({
      prompt: "second turn",
      model: "",
      planMode: false,
      sessionId: null,
      isContinuation: false,
      cwd: "/w",
      systemPrompt: "",
      effort: "high",
      conversationContext: "PREV: first turn",
    })
    expect(result.args).toContain("--thinking")
    expect(result.args[result.args.indexOf("--thinking") + 1]).toBe("high")
    const idx = result.args.indexOf("--")
    expect(result.args[idx + 1]).toContain("PREV: first turn")
    expect(result.args[idx + 1]).toContain("second turn")
  })
})
