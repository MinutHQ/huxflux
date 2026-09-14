import { describe, expect, it } from "vitest"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { mapSdkMessage, promptTokensOf } from "./agentSdkEvents.js"

// Fixtures are built loosely and cast: the SDK message types carry many
// required bookkeeping fields (uuid, session_id, ...) the mapper never reads.
function msg(raw: Record<string, unknown>): SDKMessage {
  return { uuid: "u-1", session_id: "s-1", parent_tool_use_id: null, ...raw } as unknown as SDKMessage
}

function assistant(content: unknown[], extra: Record<string, unknown> = {}): SDKMessage {
  return msg({ type: "assistant", message: { role: "assistant", content, usage: undefined }, ...extra })
}

function result(extra: Record<string, unknown> = {}): SDKMessage {
  return msg({
    type: "result", subtype: "success", is_error: false, result: "all done",
    duration_ms: 1, duration_api_ms: 1, num_turns: 1, stop_reason: "end_turn", total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 },
    modelUsage: {}, permission_denials: [],
    ...extra,
  })
}

describe("mapSdkMessage", () => {
  it("maps system init to session_init", () => {
    const events = mapSdkMessage(msg({ type: "system", subtype: "init", session_id: "sess-42" }), null)
    expect(events).toEqual([{ type: "session_init", sessionId: "sess-42" }])
  })

  it("ignores other system subtypes", () => {
    expect(mapSdkMessage(msg({ type: "system", subtype: "status" }), null)).toEqual([])
  })

  it("maps every assistant block in order", () => {
    const events = mapSdkMessage(assistant([
      { type: "thinking", thinking: "hmm" },
      { type: "text", text: "hello" },
      { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "a.ts" } },
      { type: "redacted_thinking", data: "x" },
    ]), null)
    expect(events).toEqual([
      { type: "thinking", text: "hmm" },
      { type: "text", text: "hello" },
      { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "a.ts" } },
    ])
  })

  it("maps user tool_result blocks and joins array content", () => {
    const events = mapSdkMessage(msg({
      type: "user",
      message: { role: "user", content: [
        { type: "text", text: "echoed prompt" },
        { type: "tool_result", tool_use_id: "tu-1", content: "plain" },
        { type: "tool_result", tool_use_id: "tu-2", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
      ] },
    }), null)
    expect(events).toEqual([
      { type: "tool_result", toolUseId: "tu-1", content: "plain" },
      { type: "tool_result", toolUseId: "tu-2", content: "ab" },
    ])
  })

  it("ignores a user message whose content is a plain string", () => {
    expect(mapSdkMessage(msg({ type: "user", message: { role: "user", content: "hi" } }), null)).toEqual([])
  })

  it("forwards any message with parent_tool_use_id as a subagent event", () => {
    const raw = assistant([{ type: "text", text: "child" }], { parent_tool_use_id: "parent-1" })
    const events = mapSdkMessage(raw, null)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: "subagent", toolUseId: "parent-1" })
    expect((events[0] as { event: Record<string, unknown> }).event.type).toBe("assistant")
  })

  it("maps a successful result to usage then done", () => {
    const events = mapSdkMessage(result({ modelUsage: { "claude-opus-5": { contextWindow: 1_000_000 }, "claude-haiku-4-5": { contextWindow: 200_000 } } }), 555)
    expect(events).toEqual([
      {
        type: "usage",
        inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40,
        contextTokens: 555, contextWindow: 1_000_000,
      },
      { type: "done", result: "all done" },
    ])
  })

  it("leaves contextTokens and contextWindow undefined when unknown", () => {
    const [usage] = mapSdkMessage(result(), null)
    expect(usage).toMatchObject({ type: "usage", contextTokens: undefined, contextWindow: undefined })
  })

  it("emits an error event for an error result subtype", () => {
    const events = mapSdkMessage(result({ subtype: "error_max_turns", is_error: true, errors: ["hit max turns"], result: undefined }), null)
    expect(events.map((e) => e.type)).toEqual(["usage", "error", "done"])
    expect(events[1]).toEqual({ type: "error", message: "hit max turns" })
    expect(events[2]).toEqual({ type: "done", result: undefined })
  })

  it("falls back to the subtype when an error result has no messages", () => {
    const events = mapSdkMessage(result({ subtype: "error_during_execution", is_error: true, errors: [] }), null)
    expect(events[1]).toEqual({ type: "error", message: "error_during_execution" })
  })

  it("emits an error event for a success-shaped result flagged is_error", () => {
    const events = mapSdkMessage(result({ is_error: true, result: "API error 401" }), null)
    expect(events[1]).toEqual({ type: "error", message: "API error 401" })
  })

  it("returns nothing for stream events and other bookkeeping messages", () => {
    expect(mapSdkMessage(msg({ type: "stream_event", event: { type: "message_start" } }), null)).toEqual([])
    expect(mapSdkMessage(msg({ type: "tool_progress", tool_use_id: "x" }), null)).toEqual([])
  })
})

describe("promptTokensOf", () => {
  it("sums fresh, cache-read and cache-write prompt tokens of an assistant message", () => {
    const raw = msg({
      type: "assistant",
      message: { role: "assistant", content: [], usage: { input_tokens: 1, output_tokens: 99, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } },
    })
    expect(promptTokensOf(raw)).toBe(6)
  })

  it("returns null for non-assistant messages and assistant messages without usage", () => {
    expect(promptTokensOf(result())).toBeNull()
    expect(promptTokensOf(assistant([]))).toBeNull()
  })
})
