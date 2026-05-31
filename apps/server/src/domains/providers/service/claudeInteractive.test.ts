import { describe, expect, it } from "vitest"
import { claudeInteractiveProvider } from "./claudeInteractive.js"

/**
 * Unit tests for claudeInteractiveProvider.parseStreamLine.
 *
 * claude-p's stream-json output is byte-for-byte compatible with `claude -p`,
 * so the parser surface mirrors claude.test.ts. These tests pin that contract
 * so any future divergence is caught here.
 */
describe("claudeInteractiveProvider.parseStreamLine", () => {
  it("parses an assistant text block into a text event", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "hi from claude-p" }] },
    })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "text", text: "hi from claude-p" })
  })

  it("parses an assistant thinking block into a thinking event", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "pondering" }] },
    })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "thinking", text: "pondering" })
  })

  it("parses an assistant tool_use block into a tool_use event", () => {
    const raw = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "tu_ic_1", name: "Bash", input: { command: "ls" } },
        ],
      },
    })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "tool_use",
      id: "tu_ic_1",
      name: "Bash",
      input: { command: "ls" },
    })
  })

  it("parses a tool_result event", () => {
    const raw = JSON.stringify({
      type: "tool_result",
      tool_use_id: "tu_ic_1",
      content: "stdout",
    })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "tool_result",
      toolUseId: "tu_ic_1",
      content: "stdout",
    })
  })

  it("parses a system init event into session_init", () => {
    const raw = JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "sess-ic",
    })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "session_init", sessionId: "sess-ic" })
  })

  it("parses a result event with usage into a usage event", () => {
    const raw = JSON.stringify({
      type: "result",
      usage: {
        input_tokens: 12,
        output_tokens: 34,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 6,
      },
    })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "usage",
      inputTokens: 12,
      outputTokens: 34,
      cacheReadTokens: 5,
      cacheWriteTokens: 6,
    })
  })

  it("forwards events with parent_tool_use_id as subagent events", () => {
    const raw = JSON.stringify({
      type: "assistant",
      parent_tool_use_id: "parent-ic",
      message: { content: [{ type: "text", text: "sub" }] },
    })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event?.type).toBe("subagent")
    if (event?.type === "subagent") {
      expect(event.toolUseId).toBe("parent-ic")
    }
  })

  it("returns null for malformed JSON", () => {
    const event = claudeInteractiveProvider.parseStreamLine("definitely not json {")
    expect(event).toBeNull()
  })

  it("returns null for an unknown event type", () => {
    const raw = JSON.stringify({ type: "future-event-shape" })
    const event = claudeInteractiveProvider.parseStreamLine(raw)
    expect(event).toBeNull()
  })
})
