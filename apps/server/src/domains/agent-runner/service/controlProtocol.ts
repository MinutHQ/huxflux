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

import { agentsWs } from "../../agents/agents.ws.js"
import { setPendingQuestion, getPendingQuestion, clearPendingQuestion, type PendingQuestionEntry } from "../../../askStore.js"
import { setPendingApproval, getPendingApproval, clearPendingApproval } from "../../../approvalStore.js"
import { runningProcesses, type RunningTurn } from "./processRegistry.js"
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

function writeStdinLine(proc: RunningTurn | undefined, line: string): boolean {
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
export function handleControlRequest(event: ControlRequestEvent, agentId: string, proc: RunningTurn): void {
  if (event.type === "control_cancel_request") {
    resolvePendingQuestion(agentId)
    resolvePendingApproval(agentId)
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
    // A question with nothing to ask cannot be shown, and parking it for
    // approval would surface an empty card. Deny so the agent can recover.
    const denied = writeStdinLine(proc, buildControlResponseLine(requestId, {
      behavior: "deny",
      message: "Denied: AskUserQuestion was called without any questions.",
    }))
    if (!denied) logger.warn({ agentId }, "[control] could not write deny response")
    return
  }

  // Any other tool reaching here means the agent's permission mode asked the
  // user about it. Park it and surface it; the turn stays blocked until
  // `answerPendingApproval` writes the decision back.
  setPendingApproval(agentId, {
    requestId,
    toolUseId: request.tool_use_id ?? "",
    toolName: request.tool_name ?? "",
    input: request.input,
  })
  agentsWs.askApproval(agentId, request.tool_use_id ?? "", request.tool_name ?? "", request.input)
}

/** Drop the pending question and tell every client to remove its card. */
function resolvePendingQuestion(agentId: string): void {
  const pending = getPendingQuestion(agentId)
  if (!pending) return
  clearPendingQuestion(agentId)
  agentsWs.askResolved(agentId, pending.toolUseId)
}

/** Drop the pending approval and tell every client to remove its card. */
function resolvePendingApproval(agentId: string): void {
  const pending = getPendingApproval(agentId)
  if (!pending) return
  clearPendingApproval(agentId)
  agentsWs.approvalResolved(agentId, pending.toolUseId)
}

/**
 * Answer the agent's pending tool approval by writing an allow or deny
 * control_response. `toolUseId` must match the pending approval, so a stale
 * client cannot answer a newer request with a decision meant for an older one.
 * Returns false when there is no matching approval or no writable stdin.
 */
export function answerPendingApproval(
  agentId: string,
  toolUseId: string,
  decision: "allow" | "deny",
  message?: string,
): boolean {
  const pending = getPendingApproval(agentId)
  if (!pending) return false
  if (toolUseId && pending.toolUseId && toolUseId !== pending.toolUseId) return false

  const proc = runningProcesses.get(agentId)
  const written = writeStdinLine(proc, buildControlResponseLine(pending.requestId, decision === "allow"
    ? { behavior: "allow", updatedInput: pending.input }
    : { behavior: "deny", message: message?.trim() || "Denied by the user." }))
  if (written) resolvePendingApproval(agentId)
  return written
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
 * When `toolUseId` is given it must match the pending question, so a stale
 * client cannot answer a newer question with answers meant for an older one.
 * Returns false when there is no (matching) pending question or no writable
 * stdin.
 */
export function answerPendingQuestion(agentId: string, answers: Record<string, string>, toolUseId?: string): boolean {
  const pending = getPendingQuestion(agentId)
  if (!pending) return false
  if (toolUseId !== undefined && toolUseId !== pending.toolUseId) return false
  const proc = runningProcesses.get(agentId)
  const written = writeStdinLine(proc, buildControlResponseLine(pending.requestId, {
    behavior: "allow",
    updatedInput: { questions: pending.questions, answers },
  }))
  if (written) resolvePendingQuestion(agentId)
  return written
}

/**
 * Inject a user message into the agent's running turn. The CLI delivers it to
 * the model at the next step boundary within the same turn. On success the
 * message is persisted and emitted as `message:user`. Returns false when the
 * agent has no running process or its stdin is not a writable pipe (e.g. a
 * provider that takes the prompt over argv) — callers fall back to queueing.
 *
 * While an AskUserQuestion is pending the CLI is blocked on the
 * control_response and ignores stream-json input, so a plain injection would
 * hang the turn. In that case the text is delivered as the free-text answer to
 * every pending question instead (the model sees it in the tool result).
 */
export function injectUserMessage(agentId: string, text: string, sender?: string): boolean {
  const pending = getPendingQuestion(agentId)
  // Answers are keyed by question text (same convention as the /answer
  // endpoint); AskUserQuestion questions are assumed unique within a request.
  const written = pending
    ? answerPendingQuestion(agentId, Object.fromEntries(pending.questions.map((q) => [q.question, text])))
    : writeStdinLine(runningProcesses.get(agentId), buildUserMessageLine(text))
  if (!written) return false
  persistUserMessageRow(agentId, text, sender)
  // Close the current assistant segment and open a fresh one below the
  // injected message, so post-injection thinking/tool-calls visibly answer it.
  splitCurrentTurn(agentId)
  return true
}
