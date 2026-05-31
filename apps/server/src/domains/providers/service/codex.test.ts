import { describe, expect, it } from "vitest"
import { codexProvider } from "./codex.js"

/**
 * Unit tests for codexProvider.parseStreamLine.
 *
 * Codex emits JSONL events with discriminators on `type`:
 *   thread.started, turn.started, item.started, item.completed,
 *   turn.completed, turn.failed, error
 *
 * The interesting work happens inside `item.completed`, whose `item.type`
 * sub-discriminator selects between agent_message, command_execution, and
 * file_edit.
 */
describe("codexProvider.parseStreamLine", () => {
  it("parses item.completed with agent_message into a text event", () => {
    const raw = JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "codex reply" },
    })
    const event = codexProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "text", text: "codex reply" })
  })

  it("parses item.completed with command_execution into a Bash tool_use", () => {
    const raw = JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        id: "cmd-1",
        command: "ls",
        aggregated_output: "a.ts\nb.ts\n",
        exit_code: 0,
      },
    })
    const event = codexProvider.parseStreamLine(raw)
    expect(event?.type).toBe("tool_use")
    if (event?.type === "tool_use") {
      expect(event.id).toBe("cmd-1")
      expect(event.name).toBe("Bash")
      expect(event.input).toEqual({
        command: "ls",
        output: "a.ts\nb.ts\n",
        exit_code: 0,
      })
    }
  })

  it("parses item.completed with file_edit into an Edit tool_use", () => {
    const raw = JSON.stringify({
      type: "item.completed",
      item: {
        type: "file_edit",
        id: "edit-1",
        file_path: "src/foo.ts",
        description: "add export",
      },
    })
    const event = codexProvider.parseStreamLine(raw)
    expect(event?.type).toBe("tool_use")
    if (event?.type === "tool_use") {
      expect(event.id).toBe("edit-1")
      expect(event.name).toBe("Edit")
      expect(event.input).toEqual({
        file: "src/foo.ts",
        description: "add export",
      })
    }
  })

  it("parses turn.completed with usage into a usage event", () => {
    const raw = JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 200,
        output_tokens: 80,
        cached_input_tokens: 20,
      },
    })
    const event = codexProvider.parseStreamLine(raw)
    expect(event).toEqual({
      type: "usage",
      inputTokens: 200,
      outputTokens: 80,
      cacheReadTokens: 20,
    })
  })

  it("parses an error event into an error event", () => {
    const raw = JSON.stringify({
      type: "error",
      message: "Codex broke",
    })
    const event = codexProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "error", message: "Codex broke" })
  })

  it("parses turn.failed into an error event using error.message", () => {
    const raw = JSON.stringify({
      type: "turn.failed",
      error: { message: "model refused" },
    })
    const event = codexProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "error", message: "model refused" })
  })

  it("falls back to a default message when turn.failed has no error.message", () => {
    const raw = JSON.stringify({ type: "turn.failed" })
    const event = codexProvider.parseStreamLine(raw)
    expect(event).toEqual({ type: "error", message: "Turn failed" })
  })

  it("returns null for malformed JSON", () => {
    const event = codexProvider.parseStreamLine("{ not json")
    expect(event).toBeNull()
  })

  it("returns null for an unknown event type", () => {
    const raw = JSON.stringify({ type: "thread.started" })
    const event = codexProvider.parseStreamLine(raw)
    expect(event).toBeNull()
  })
})
