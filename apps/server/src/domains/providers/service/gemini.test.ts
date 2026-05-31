import { describe, expect, it } from "vitest"
import { geminiProvider } from "./gemini.js"

/**
 * Unit tests for geminiProvider.parseStreamLine.
 *
 * Gemini emits JSONL events keyed by `type`:
 *   init, message (role=assistant), thinking, tool_use, tool_result, result, error
 *
 * `result` doubles as the usage carrier when status is success, and as the
 * error carrier when status === "error". Several fields accept multiple
 * shapes (tool_name vs name, parameters vs input, error string vs object)
 * because the upstream CLI is still in flux.
 */
describe("geminiProvider.parseStreamLine", () => {
  it("parses init into session_init", () => {
    const raw = JSON.stringify({ type: "init", session_id: "sess-gem" })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "session_init", sessionId: "sess-gem" })
  })

  it("parses an assistant message into a text event", () => {
    const raw = JSON.stringify({
      type: "message",
      role: "assistant",
      content: "gemini reply",
    })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "text", text: "gemini reply" })
  })

  it("parses a thinking event", () => {
    const raw = JSON.stringify({ type: "thinking", content: "internal monologue" })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "thinking", text: "internal monologue" })
  })

  it("parses a tool_use event using tool_name and parameters", () => {
    const raw = JSON.stringify({
      type: "tool_use",
      tool_id: "gtu-1",
      tool_name: "ReadFile",
      parameters: { path: "x.ts" },
    })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "tool_use",
      id: "gtu-1",
      name: "ReadFile",
      input: { path: "x.ts" },
    })
  })

  it("parses a tool_use event using the name/input fallback aliases", () => {
    const raw = JSON.stringify({
      type: "tool_use",
      tool_id: "gtu-2",
      name: "RunShell",
      input: { command: "echo hi" },
    })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "tool_use",
      id: "gtu-2",
      name: "RunShell",
      input: { command: "echo hi" },
    })
  })

  it("parses a tool_result event", () => {
    const raw = JSON.stringify({
      type: "tool_result",
      tool_id: "gtu-1",
      output: "file contents",
    })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "tool_result",
      toolUseId: "gtu-1",
      content: "file contents",
    })
  })

  it("parses a successful result with stats into a usage event", () => {
    const raw = JSON.stringify({
      type: "result",
      status: "success",
      stats: { input_tokens: 150, output_tokens: 60 },
    })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "usage",
      inputTokens: 150,
      outputTokens: 60,
    })
  })

  it("parses a result with status=error into an error event", () => {
    const raw = JSON.stringify({
      type: "result",
      status: "error",
      error: { message: "quota exceeded" },
    })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "error", message: "quota exceeded" })
  })

  it("parses a standalone error event", () => {
    const raw = JSON.stringify({ type: "error", message: "something broke" })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "error", message: "something broke" })
  })

  it("returns null for malformed JSON", () => {
    const event = geminiProvider.parseStreamLine("not-json")
    expect(event).toBeNull()
  })

  it("returns null for an unknown event type", () => {
    const raw = JSON.stringify({ type: "future-shape", foo: "bar" })
    const event = geminiProvider.parseStreamLine(raw)
    expect(event).toBeNull()
  })
})
