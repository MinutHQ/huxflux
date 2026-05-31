// WebSocket events emitted by the agents domain.
//
// Each entry in `agentsEventsConfig` declares one event: the channel
// (`broadcast` to every connected socket, `emit` to sockets subscribed to a
// specific agent) and a typed `build` function that constructs the payload.
// `defineEvents` wraps this into a callable object — call sites use
// `agentsWs.agentUpdated(agent)` instead of hand-writing the literal type.
//
// `AgentsServerEvent` is the discriminated union derived from this config and
// is composed into the central `ServerEvent` in `src/domains/ws/events.ts`.

import type { AgentSummary, Message, FileChange, ToolCall } from "../../types.js"
import { defineEvents, type InferEvents } from "../ws/define.js"

type UserMessagePayload = { id: string; role: "user"; content: string; timestamp: string; sender?: string }

type AskQuestion = { question: string; header?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }

type PortInfo = { agentId: string; agentTitle: string; port: number }

const agentsEventsConfig = {
  agentUpdated: {
    channel: "broadcast",
    build: (agent: AgentSummary) => ({ type: "agent:updated" as const, agent }),
  },
  agentDeleted: {
    channel: "broadcast",
    build: (agentId: string) => ({ type: "agent:deleted" as const, agentId }),
  },
  agentUpdatedTo: {
    // Same payload as agentUpdated, but routed to one agent's subscribers.
    // `_agentId` is forwarded by the factory to `emit()` but isn't part of the payload.
    channel: "emit",
    build: (_agentId: string, agent: AgentSummary) => ({ type: "agent:updated" as const, agent }),
  },
  messageUser: {
    channel: "emit",
    build: (agentId: string, message: UserMessagePayload) => ({ type: "message:user" as const, agentId, message }),
  },
  messageStart: {
    channel: "emit",
    build: (agentId: string, messageId: string) => ({ type: "message:start" as const, agentId, messageId }),
  },
  messageChunk: {
    channel: "emit",
    build: (agentId: string, messageId: string, delta: string) => ({ type: "message:chunk" as const, agentId, messageId, delta }),
  },
  messageThinking: {
    channel: "emit",
    build: (agentId: string, messageId: string, delta: string) => ({ type: "message:thinking" as const, agentId, messageId, delta }),
  },
  toolCall: {
    channel: "emit",
    build: (agentId: string, messageId: string, toolCall: ToolCall) => ({ type: "tool:call" as const, agentId, messageId, toolCall }),
  },
  toolResult: {
    channel: "emit",
    build: (agentId: string, messageId: string, toolCallId: string, result: string) => ({ type: "tool:result" as const, agentId, messageId, toolCallId, result }),
  },
  messageDone: {
    channel: "emit",
    build: (agentId: string, messageId: string, message: Message) => ({ type: "message:done" as const, agentId, messageId, message }),
  },
  terminalLine: {
    channel: "emit",
    build: (agentId: string, line: string) => ({ type: "terminal:line" as const, agentId, line }),
  },
  subagentEvent: {
    // Forwards an arbitrary upstream event payload verbatim — the inner shape
    // is opaque on purpose so any Claude CLI event can be relayed.
    channel: "emit",
    build: (agentId: string, toolUseId: string, event: Record<string, unknown>) =>
      ({ type: "subagent:event" as const, agentId, toolUseId, event }),
  },
  fileChanged: {
    channel: "emit",
    build: (agentId: string, files: FileChange[]) => ({ type: "file:changed" as const, agentId, files }),
  },
  askQuestion: {
    channel: "emit",
    build: (agentId: string, toolUseId: string, questions: AskQuestion[]) =>
      ({ type: "ask:question" as const, agentId, toolUseId, questions }),
  },
  portsChanged: {
    channel: "broadcast",
    build: (ports: PortInfo[]) => ({ type: "ports:changed" as const, ports }),
  },
  // Transport-level error. `agentId` is optional in the wire shape; emit
  // routes it to a single agent's subscribers when known.
  errorEmit: {
    channel: "emit",
    build: (agentId: string, message: string) => ({ type: "error" as const, agentId, message }),
  },
} as const

export const agentsWs = defineEvents(agentsEventsConfig)

export type AgentsServerEvent = InferEvents<typeof agentsEventsConfig>
