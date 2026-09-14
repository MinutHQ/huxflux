// Drive a provider that runs its turn in-process (`ProviderAdapter.runTurn`)
// through the same streaming pipeline the spawn path uses. The provider's
// async iterator replaces the CLI's stdout; an AbortController replaces
// SIGTERM; a parsed stream-json sink replaces the stdin pipe so mid-run
// injection and AskUserQuestion answers reach the provider unchanged; the
// returned exit code feeds finalize exactly like a process close.

import { v4 as uuid } from "uuid"
import { db } from "../../../db/index.js"
import { terminalLines as terminalLinesTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"
import type {
  NormalizedStreamEvent, PermissionDecision, PermissionRequest, ProviderAdapter, RunTurnContext, SpawnOptions,
} from "../../providers/providers.types.js"
import type { StreamState } from "../../agents/agents.types.js"
import { runningProcesses, type RunningTurn } from "./processRegistry.js"
import { handleControlRequest } from "./controlProtocol.js"
import { handleNormalizedEvent } from "./normalizedEvent.js"
import { AsyncQueue, createInputSink, type ControlResponsePayload } from "./inProcessInput.js"
import type { TurnSegmentRef } from "./turnSegments.js"
import { logger } from "../../../logger.js"

/** Exit code reported when the turn was aborted (mirrors a SIGTERM'd process). */
export const ABORTED_EXIT_CODE = 143

interface InProcessTurnArgs {
  provider: ProviderAdapter & { runTurn: NonNullable<ProviderAdapter["runTurn"]> }
  spawnOptions: SpawnOptions
  env: NodeJS.ProcessEnv
  state: StreamState
  agentId: string
  turnRef: TurnSegmentRef
  scheduleFlush: () => void
}

/**
 * Start the provider's in-process turn and register an abortable handle in
 * `runningProcesses`. Resolves with an exit code once the iterator ends:
 * 0 on a clean end, `ABORTED_EXIT_CODE` when stopped, 1 when it threw.
 * Never rejects — a thrown error is surfaced to the user as an error event.
 */
export function startInProcessTurn(args: InProcessTurnArgs): Promise<number> {
  const { provider, spawnOptions, env, agentId } = args
  const abort = new AbortController()
  const channel = createChannel(args, abort.signal)
  const handle: RunningTurn = {
    stdin: channel.stdin,
    kill: () => {
      abort.abort()
      return true
    },
  }
  runningProcesses.set(agentId, handle)

  const ctx: RunTurnContext = {
    signal: abort.signal,
    env,
    onStderr: (chunk) => recordStderr(agentId, chunk),
    userMessages: channel.userMessages,
    requestPermission: (request) => channel.requestPermission(request, handle),
  }

  logger.info({ agentId, model: spawnOptions.model }, `[runner] started ${provider.id} in-process turn`)
  return consumeTurn(provider.runTurn(spawnOptions, ctx), abort.signal, handle, args).finally(() => channel.dispose())
}

function recordStderr(agentId: string, chunk: string): void {
  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue
    db.insert(terminalLinesTable).values({ id: uuid(), agentId, line, createdAt: new Date().toISOString() }).run()
    agentsWs.terminalLine(agentId, line)
  }
}

async function consumeTurn(
  events: AsyncIterable<NormalizedStreamEvent>,
  signal: AbortSignal,
  handle: RunningTurn,
  args: InProcessTurnArgs,
): Promise<number> {
  const { state, agentId, turnRef, scheduleFlush, provider } = args
  try {
    for await (const event of events) {
      // Anything the provider emits after a stop is noise; breaking here also
      // runs the generator's cleanup (`return()`), which closes the SDK query.
      if (signal.aborted) break
      handleNormalizedEvent(event, state, agentId, turnRef.messageId, scheduleFlush)
      // The turn is over — close the input so the provider stops waiting for
      // more user messages (same as ending the CLI's stdin on `result`).
      if (event.type === "done" && handle.stdin && !handle.stdin.destroyed) handle.stdin.end()
    }
    return signal.aborted ? ABORTED_EXIT_CODE : 0
  } catch (err) {
    if (signal.aborted) return ABORTED_EXIT_CODE
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err, agentId }, `[runner] ${provider.id} in-process turn failed`)
    handleNormalizedEvent({ type: "error", message }, state, agentId, turnRef.messageId, scheduleFlush)
    return 1
  }
}

interface TurnChannel {
  stdin: RunningTurn["stdin"]
  userMessages: AsyncIterable<string>
  requestPermission(request: PermissionRequest, handle: RunningTurn): Promise<PermissionDecision>
  dispose(): void
}

/**
 * The stdin stand-in plus the two things it feeds: injected user messages
 * (queued for the provider) and control responses (resolving a pending
 * `requestPermission`). Permission requests go through the shared control
 * protocol handler, so AskUserQuestion reaches the UI exactly as it does
 * for the CLI, and the answer comes back as a control_response line.
 */
function createChannel(args: InProcessTurnArgs, signal: AbortSignal): TurnChannel {
  const { agentId, state } = args
  const userMessages = new AsyncQueue<string>()
  const pending = new Map<string, (decision: PermissionDecision) => void>()

  const settle = (requestId: string, response: ControlResponsePayload): void => {
    const resolve = pending.get(requestId)
    if (!resolve) return
    pending.delete(requestId)
    resolve(toDecision(response))
  }

  const stdin = createInputSink({
    onUserMessage: (text) => userMessages.push(text),
    onControlResponse: settle,
    onEnd: () => userMessages.close(),
  })

  return {
    stdin,
    userMessages,
    requestPermission(request, handle): Promise<PermissionDecision> {
      const requestId = uuid()
      return new Promise<PermissionDecision>((resolve) => {
        pending.set(requestId, resolve)
        const onAbort = (): void => {
          handleControlRequest({ type: "control_cancel_request", request_id: requestId }, agentId, handle)
          settle(requestId, { behavior: "deny", message: "Turn stopped" })
        }
        request.signal.addEventListener("abort", onAbort, { once: true })
        if (signal !== request.signal) signal.addEventListener("abort", onAbort, { once: true })
        handleControlRequest({
          type: "control_request",
          request_id: requestId,
          request: {
            subtype: "can_use_tool",
            tool_name: request.toolName,
            input: request.input,
            tool_use_id: request.toolUseId || findOpenToolUseId(state, request.toolName),
          },
        }, agentId, handle)
      })
    },
    dispose(): void {
      userMessages.close()
      for (const requestId of [...pending.keys()]) settle(requestId, { behavior: "deny", message: "Turn ended" })
      if (!stdin.destroyed) stdin.destroy()
    },
  }
}

/** Fallback when the provider did not name the asking tool_use: the newest unanswered call of that tool. */
function findOpenToolUseId(state: StreamState, toolName: string): string {
  for (let i = state.collectedToolCalls.length - 1; i >= 0; i--) {
    const tc = state.collectedToolCalls[i]
    if (tc && tc.tool === toolName && tc.result == null) return tc.id
  }
  return ""
}

function toDecision(response: ControlResponsePayload): PermissionDecision {
  if (response.behavior === "allow") return { behavior: "allow", updatedInput: response.updatedInput }
  return { behavior: "deny", message: response.message ?? "Denied" }
}
