// Claude CLI stdin control protocol.
//
// With `--permission-prompt-tool stdio` the CLI emits `control_request`
// events on stdout (subtype `can_use_tool`) whenever a tool needs a
// permission decision, and reads `control_response` lines from stdin.
// AskUserQuestion is the interesting case: the CLI only runs the tool when
// the host answers the request with the user's answers in `updatedInput`.
//
// The open stdin pipe is also used to inject additional user messages into a
// running turn (stream-json input mode delivers them to the model at the next
// step boundary).

import type { ChildProcess } from "node:child_process"
import { agentsWs } from "../../agents/agents.ws.js"
import { setPendingQuestion, getPendingQuestion, clearPendingQuestion, type PendingQuestionEntry } from "../../../askStore.js"
import { runningProcesses } from "./processRegistry.js"
import { persistUserMessageRow } from "./userMessage.js"
import { splitCurrentTurn } from "./turnSegments.js"
import { logger } from "../../../logger.js"

export interface ControlRequestEvent {
  type: string
  request_id?: string
  request?: {
    subtype?: string
    tool_name?: string
    input?: unknown
    tool_use_id?: string
  }
}

function writeStdinLine(proc: ChildProcess | undefined, line: string): boolean {
  if (!proc?.stdin || proc.stdin.destroyed || !proc.stdin.writable) return false
  proc.stdin.write(line + "\n")
  return true
}

/** JSON line for a stream-json user message (initial prompt or injection). */
export function buildUserMessageLine(text: string): string {
  return JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text }] },
  })
}

function buildControlResponseLine(requestId: string, response: Record<string, unknown>): string {
  return JSON.stringify({
    type: "control_response",
    response: { subtype: "success", request_id: requestId, response },
  })
}

/**
 * Handle a `control_request` / `control_cancel_request` event from the CLI.
 * AskUserQuestion requests are parked in the ask store and surfaced to the UI;
 * everything else is denied (matches the pre-control-protocol behavior where
 * no permission host existed and anything that would prompt was auto-denied —
 * under `--dangerously-skip-permissions` nothing else prompts anyway).
 */
export function handleControlRequest(event: ControlRequestEvent, agentId: string, proc: ChildProcess): void {
  if (event.type === "control_cancel_request") {
    clearPendingQuestion(agentId)
    return
  }
  const requestId = event.request_id
  const request = event.request
  if (!requestId || !request || request.subtype !== "can_use_tool") return

  if (request.tool_name === "AskUserQuestion") {
    const questions = extractQuestions(request.input)
    if (questions) {
      setPendingQuestion(agentId, requestId, request.tool_use_id ?? "", questions)
      agentsWs.askQuestion(agentId, request.tool_use_id ?? "", questions)
      return
    }
  }

  const denied = writeStdinLine(proc, buildControlResponseLine(requestId, {
    behavior: "deny",
    message: "Denied: this tool cannot prompt for permission in a Huxflux run.",
  }))
  if (!denied) logger.warn({ agentId, tool: request.tool_name }, "[control] could not write deny response")
}

function extractQuestions(input: unknown): PendingQuestionEntry[] | null {
  if (!input || typeof input !== "object") return null
  const questions = (input as { questions?: unknown }).questions
  if (!Array.isArray(questions) || questions.length === 0) return null
  return questions as PendingQuestionEntry[]
}

/**
 * Answer the agent's pending AskUserQuestion by writing an allow
 * control_response with the user's answers merged into the tool input.
 * Returns false when there is no pending question or no writable stdin.
 */
export function answerPendingQuestion(agentId: string, answers: Record<string, string>): boolean {
  const pending = getPendingQuestion(agentId)
  if (!pending) return false
  const proc = runningProcesses.get(agentId)
  const written = writeStdinLine(proc, buildControlResponseLine(pending.requestId, {
    behavior: "allow",
    updatedInput: { questions: pending.questions, answers },
  }))
  if (written) clearPendingQuestion(agentId)
  return written
}

/**
 * Inject a user message into the agent's running turn. The CLI delivers it to
 * the model at the next step boundary within the same turn. On success the
 * message is persisted and emitted as `message:user`. Returns false when the
 * agent has no running process or its stdin is not a writable pipe (e.g. a
 * provider that takes the prompt over argv) — callers fall back to queueing.
 */
export function injectUserMessage(agentId: string, text: string, sender?: string): boolean {
  const written = writeStdinLine(runningProcesses.get(agentId), buildUserMessageLine(text))
  if (!written) return false
  persistUserMessageRow(agentId, text, sender)
  // Close the current assistant segment and open a fresh one below the
  // injected message, so post-injection thinking/tool-calls visibly answer it.
  splitCurrentTurn(agentId)
  return true
}
