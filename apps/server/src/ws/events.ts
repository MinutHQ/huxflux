import type { AgentSummary, Message, FileChange, ToolCall } from "../types.js"

// Client → Server
export type ClientEvent =
  | { type: "subscribe";   agentId: string }
  | { type: "unsubscribe"; agentId: string }

// Server → Client
export type ServerEvent =
  | { type: "agent:updated";    agent: AgentSummary }
  | { type: "agent:deleted";    agentId: string }
  | { type: "message:user";     agentId: string; message: { id: string; role: "user"; content: string; timestamp: string; sender?: string } }
  | { type: "message:start";    agentId: string; messageId: string }
  | { type: "message:chunk";    agentId: string; messageId: string; delta: string }
  | { type: "message:thinking"; agentId: string; messageId: string; delta: string }
  | { type: "tool:call";        agentId: string; messageId: string; toolCall: ToolCall }
  | { type: "tool:result";      agentId: string; messageId: string; toolCallId: string; result: string }
  | { type: "message:done";     agentId: string; messageId: string; message: Message }
  | { type: "terminal:line";    agentId: string; line: string }
  | { type: "subagent:event";   agentId: string; toolUseId: string; event: Record<string, unknown> }
  | { type: "file:changed";     agentId: string; files: FileChange[] }
  | { type: "ask:question";     agentId: string; toolUseId: string; questions: Array<{ question: string; header?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }> }
  | { type: "task:comment";      taskId: string; comment: { id: string; author: string; role: string; content: string; agentId?: string; createdAt: string } }
  | { type: "task:updated";      taskId: string }
  | { type: "error";            agentId?: string; message: string }
