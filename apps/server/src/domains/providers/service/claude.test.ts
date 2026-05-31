import { describe, expect, it } from "vitest"
import { claudeProvider } from "./claude.js"

/**
 * Unit tests for claudeProvider.parseStreamLine.
 *
 * Each test feeds a JSON-encoded line that mirrors a real Claude CLI
 * stream-json event and asserts the NormalizedStreamEvent shape.
 * Malformed and unknown events must return null without throwing.
 */
describe("claudeProvider.parseStreamLine", () => {
  it("parses an assistant text block into a text event", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "hello world" }] },
    })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "text", text: "hello world" })
  })

  it("parses an assistant thinking block into a thinking event", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "let me think" }] },
    })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "thinking", text: "let me think" })
  })

  it("parses an assistant tool_use block into a tool_use event", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "tu_1", name: "Read", input: { path: "a.ts" } },
        ],
      },
    })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "tool_use",
      id: "tu_1",
      name: "Read",
      input: { path: "a.ts" },
    })
  })

  it("parses a tool_result event", () => {
    const raw = JSON.stringify({
      type: "tool_result",
      tool_use_id: "tu_1",
      content: "ok",
    })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "tool_result", toolUseId: "tu_1", content: "ok" })
  })

  it("parses a system init event into session_init", () => {
    const raw = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "sess-1",
    })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "session_init", sessionId: "sess-1" })
  })

  it("parses a result event with usage into a usage event", () => {
    const raw = JSON.stringify({
      type: "result",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "usage",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    })
  })

  it("forwards events with parent_tool_use_id as subagent events", () => {
    const raw = JSON.stringify({
      type: "assistant",
      parent_tool_use_id: "parent-tu",
      message: { content: [{ type: "text", text: "sub output" }] },
    })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event?.type).toBe("subagent")
    if (event?.type === "subagent") {
      expect(event.toolUseId).toBe("parent-tu")
      expect(event.event).toMatchObject({ parent_tool_use_id: "parent-tu" })
    }
  })

  it("returns null for malformed JSON", () => {
    const event = claudeProvider.parseStreamLine("{not json")
    expect(event).toBeNull()
  })

  it("returns null for an empty line", () => {
    const event = claudeProvider.parseStreamLine("")
    expect(event).toBeNull()
  })

  it("returns null for an unknown event type that has no tool_use linkage", () => {
    const raw = JSON.stringify({ type: "definitely-not-a-real-event-shape" })
    const event = claudeProvider.parseStreamLine(raw)
    expect(event).toBeNull()
  })
})
