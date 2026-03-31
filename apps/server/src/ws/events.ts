import type { AgentSummary, Message, FileChange, ToolCall } from "../types.js"

// Client → Server
export type ClientEvent =
  | { type: "subscribe";   agentId: string }
  | { type: "unsubscribe"; agentId: string }

// Server → Client
export type ServerEvent =
  | { type: "agent:updated";    agent: AgentSummary }
  | { type: "message:start";    agentId: string; messageId: string }
  | { type: "message:chunk";    agentId: string; messageId: string; delta: string }
  | { type: "message:thinking"; agentId: string; messageId: string; delta: string }
  | { type: "tool:call";        agentId: string; messageId: string; toolCall: ToolCall }
  | { type: "tool:result";      agentId: string; messageId: string; toolCallId: string; result: string }
  | { type: "message:done";     agentId: string; messageId: string; message: Message }
  | { type: "terminal:line";    agentId: string; line: string }
  | { type: "subagent:event";   agentId: string; toolUseId: string; event: Record<string, unknown> }
  | { type: "file:changed";     agentId: string; files: FileChange[] }
  | { type: "error";            agentId?: string; message: string }
