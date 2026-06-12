// Cross-platform Zod schemas for the agents domain. The same shapes are used
// on both sides of the wire — the server validates request bodies against the
// `*BodySchema` exports, and the client validates responses against the entity
// schemas via `reqValidated()` in `./api.ts`.
//
// Field-shape note: the server emits raw Drizzle rows for the agent resource,
// so int-flag columns (`streaming`, `pinned`, `unread`, `prCommentMonitoring`,
// `ciMonitoring`) arrive as `number | null` on the wire even though the legacy
// TypeScript surface declared them as `boolean | undefined`. The schemas below
// accept both shapes (and `null`) so existing consumers keep working without a
// server-side coercion layer. Tightening this is part of the future namespace
// migration, not this conversion.
import { z } from "zod/v4"
import { statusColors } from "@huxflux/tokens"
import { prStatusSchema, type PRStatus } from "../pull-requests/pull-requests.types.js"

// ── AgentStatus ──────────────────────────────────────────────────────────────

export const agentStatusSchema = z.enum([
  "done",
  "in-review",
  "draft-pr",
  "in-progress",
  "backlog",
  "cancelled",
])

export type AgentStatus = z.infer<typeof agentStatusSchema>

// ── FileChange ───────────────────────────────────────────────────────────────

export const fileChangeSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
})

export type FileChange = z.infer<typeof fileChangeSchema>

// ── ToolCall (recursive) ─────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  tool: string
  args?: string
  result?: string
  duration?: string
  subCalls?: ToolCall[]
  // Text output streamed by a sub-agent (Agent tool calls only).
  outputText?: string
  // Text the main assistant emitted just before this tool call (intermediate
  // narration like "Now let me look at..."). Lets the UI interleave it with
  // tool calls in the order they were produced.
  precedingText?: string
}

export const toolCallSchema: z.ZodType<ToolCall> = z.lazy(() =>
  z.object({
    id: z.string(),
    tool: z.string(),
    args: z.string().optional(),
    result: z.string().optional(),
    duration: z.string().optional(),
    subCalls: z.array(toolCallSchema).optional(),
    outputText: z.string().optional(),
    precedingText: z.string().optional(),
  }),
)

// ── Message ──────────────────────────────────────────────────────────────────
// One schema covers both user + assistant messages — every assistant-only
// field is optional and a user message simply omits it. A discriminated union
// would force the client to branch on `role` everywhere it currently treats a
// message as a single shape.

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  thinking: z.string().nullish(),
  timestamp: z.string(),
  toolCalls: z.array(toolCallSchema).optional(),
  durationMs: z.number().nullish(),
  model: z.string().nullish(),
  inputTokens: z.number().nullish(),
  outputTokens: z.number().nullish(),
  cacheReadTokens: z.number().nullish(),
  cacheWriteTokens: z.number().nullish(),
  // Display name for the sender (delegated messages between agents).
  sender: z.string().nullish(),
  // Client-only: text being streamed since the last tool call. Rendered inside
  // the tool-calls accordion so intermediate narration doesn't first appear
  // under the bubble and then jump into the accordion. Cleared on
  // message:done — the server then provides the authoritative `content`.
  pendingText: z.string().optional(),
})

export type Message = z.infer<typeof messageSchema>

// ── Agent ────────────────────────────────────────────────────────────────────

// Helper: server emits `prStatus` as either a parsed object (from
// `parsePrStatus()`), `null` (no PR linked), or `undefined`. Use `.nullish()`
// so a server response of `null` does not fail Zod validation in
// `reqValidated`.
const prStatusOnAgentSchema = prStatusSchema.nullish()

const diffSummarySchema = z.object({
  additions: z.number(),
  deletions: z.number(),
  commits: z.number().optional(),
})

// Integer-or-boolean-or-null flag column. The server returns the raw DB
// integer (0/1/null); some pre-conversion code paths returned booleans. The
// client never relies on the literal numeric vs boolean — every consumer uses
// truthy checks.
const intFlagSchema = z.union([z.number(), z.boolean()]).nullish()

export const agentSchema = z.object({
  id: z.string(),
  repoId: z.string().nullish(),
  title: z.string(),
  status: agentStatusSchema,
  branch: z.string(),
  baseBranch: z.string().nullish(),
  parentAgentId: z.string().nullish(),
  pr: z.string().nullish(),
  prNumber: z.number().nullish(),
  prStatus: prStatusOnAgentSchema,
  model: z.string(),
  provider: z.string().nullish(),
  taskId: z.string().nullish(),
  threadParentId: z.string().nullish(),
  location: z.string(),
  unread: z.number().nullish(),
  streaming: intFlagSchema,
  daysAgo: z.string().optional(),
  description: z.string().nullish(),
  draft: z.string().nullish(),
  diffSummary: diffSummarySchema.optional(),
  prCommentMonitoring: intFlagSchema,
  ciMonitoring: intFlagSchema,
  pinned: intFlagSchema,
  messages: z.array(messageSchema),
  hasMore: z.boolean().optional(),
  fileChanges: z.array(fileChangeSchema),
  terminalOutput: z.array(z.string()),
  // Server always sets these; older agents may omit them in rare edge cases.
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  // Internal session id for resumable Claude turns. Not consumed by the UI
  // but present on the wire so the response parser must accept it.
  sessionId: z.string().nullish(),
  // DB-only flag indicating the agent runs in-place without a worktree. Some
  // routes still echo it as part of the row.
  noWorktree: intFlagSchema,
  deletedAt: z.string().nullish(),
})

export type Agent = z.infer<typeof agentSchema>

// AgentSummary is Agent without the heavy collections. Drop the message /
// file-change / terminal arrays so sidebar payloads stay small.
export const agentSummarySchema = agentSchema.omit({
  messages: true,
  fileChanges: true,
  terminalOutput: true,
  hasMore: true,
})

export type AgentSummary = z.infer<typeof agentSummarySchema>

// ── SlashCommand ─────────────────────────────────────────────────────────────

export const slashCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  args: z.string().optional(),
  source: z.enum(["builtin", "skill"]),
})

export type SlashCommand = z.infer<typeof slashCommandSchema>

// ── WorkspaceStats ───────────────────────────────────────────────────────────

export const workspaceStatsSchema = z.object({
  agents: z.object({
    total: z.number(),
    active: z.number(),
    deleted: z.number(),
  }),
  messages: z.object({
    total: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadTokens: z.number(),
    cacheWriteTokens: z.number(),
  }),
  toolCalls: z.number(),
  fileChanges: z.object({
    total: z.number(),
    additions: z.number(),
    deletions: z.number(),
  }),
  repos: z.number(),
  dailyAgents: z.array(z.object({
    date: z.string(),
    count: z.number(),
  })),
})

export type WorkspaceStats = z.infer<typeof workspaceStatsSchema>

// ── FileTreeNode (recursive) ─────────────────────────────────────────────────

export interface FileTreeNode {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileTreeNode[]
}

export const fileTreeNodeSchema: z.ZodType<FileTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(["file", "directory"]),
    children: z.array(fileTreeNodeSchema).optional(),
  }),
)

// ── Terminal tab ─────────────────────────────────────────────────────────────

export const terminalTabSchema = z.object({
  id: z.string(),
  terminalId: z.string(),
  label: z.string().nullable(),
  orderIdx: z.number(),
  // The DB rows carry a foreign-key column the API echoes through; mark it
  // optional so the schema accepts either shape.
  agentId: z.string().optional(),
})

export type TerminalTab = z.infer<typeof terminalTabSchema>

// ── Ports ────────────────────────────────────────────────────────────────────

export const agentPortEntrySchema = z.object({
  agentId: z.string(),
  agentTitle: z.string(),
  port: z.number(),
})

export type AgentPortEntry = z.infer<typeof agentPortEntrySchema>

// ── Context window probe response ────────────────────────────────────────────

export const agentContextSchema = z.object({
  used: z.number(),
  limit: z.number(),
  percent: z.number(),
  model: z.string().optional(),
  categories: z.array(z.object({
    name: z.string(),
    tokens: z.number(),
    percent: z.number(),
  })).optional(),
})

export type AgentContext = z.infer<typeof agentContextSchema>

// ── Batched file diff payload ────────────────────────────────────────────────

export const agentFileDiffSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  diff: z.string(),
  newContent: z.string(),
  oldContent: z.string(),
})

export type AgentFileDiff = z.infer<typeof agentFileDiffSchema>

// ── System SSH info (consumed by agent open-in-editor flow) ──────────────────

export const systemSshInfoSchema = z.object({
  host: z.string(),
  port: z.number(),
  user: z.string(),
  configured: z.boolean(),
})

export type SystemSshInfo = z.infer<typeof systemSshInfoSchema>

// ── Request bodies (server-validated, optionally client-validated) ───────────

export const createAgentBodySchema = z.object({
  repoId: z.string().optional(),
  title: z.string(),
  branch: z.string(),
  model: z.string().optional(),
  provider: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  shareWorktreeWith: z.string().optional(),
  noWorktree: z.boolean().optional(),
  existingBranch: z.boolean().optional(),
  baseBranch: z.string().optional(),
})

export type CreateAgentBody = z.infer<typeof createAgentBodySchema>

export const updateAgentBodySchema = z.object({
  title: z.string().optional(),
  status: agentStatusSchema.optional(),
  branch: z.string().optional(),
  pr: z.string().nullable().optional(),
  description: z.string().optional(),
  unread: z.number().optional(),
  baseBranch: z.string().optional(),
  draft: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  // Server accepts boolean | null (and converts to 0/1/null integer).
  prCommentMonitoring: z.boolean().nullable().optional(),
  ciMonitoring: z.boolean().nullable().optional(),
  pinned: z.boolean().optional(),
})

export type UpdateAgentBody = z.infer<typeof updateAgentBodySchema>

export const sendMessageBodySchema = z.object({
  content: z.string(),
  planMode: z.boolean().optional(),
  sender: z.string().optional(),
  delegateFrom: z.string().optional(),
  effort: z.string().optional(),
})

export type SendMessageBody = z.infer<typeof sendMessageBodySchema>

export const switchBranchBodySchema = z.object({
  branch: z.string(),
  force: z.boolean().optional(),
})

export type SwitchBranchBody = z.infer<typeof switchBranchBodySchema>

export const renameBranchBodySchema = z.object({
  branch: z.string(),
})

export type RenameBranchBody = z.infer<typeof renameBranchBodySchema>

export const generateTitleBodySchema = z.object({
  branch: z.boolean().optional(),
})

export type GenerateTitleBody = z.infer<typeof generateTitleBodySchema>

const askQuestionSchema = z.object({
  question: z.string(),
  header: z.string().optional(),
  multiSelect: z.boolean().optional(),
  options: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
  })).optional(),
})

export const askBodySchema = z.object({
  tool_input: z.object({
    questions: z.array(askQuestionSchema),
  }),
  tool_use_id: z.string(),
})

export type AskBody = z.infer<typeof askBodySchema>

export const answerBodySchema = z.object({
  answers: z.record(z.string(), z.string()),
  toolUseId: z.string().optional(),
})

export type AnswerBody = z.infer<typeof answerBodySchema>

export const saveFileContentBodySchema = z.object({
  path: z.string(),
  content: z.string(),
})

export type SaveFileContentBody = z.infer<typeof saveFileContentBodySchema>

export const openInBodySchema = z.object({
  app: z.string(),
})

export type OpenInBody = z.infer<typeof openInBodySchema>

export const uploadFileBodySchema = z.object({
  name: z.string(),
  data: z.string(),
  mimeType: z.string(),
})

export type UploadFileBody = z.infer<typeof uploadFileBodySchema>

export const terminalTabUpdateBodySchema = z.object({
  label: z.string().nullable(),
})

export type TerminalTabUpdateBody = z.infer<typeof terminalTabUpdateBodySchema>

// ── statusConfig / statusOrder (non-schema lookups) ─────────────────────────

function sc(key: keyof typeof statusColors, label: string) {
  const t = statusColors[key]
  return { label, color: t.tw.color, dotColor: t.tw.dot, hex: t.color }
}

export const statusConfig: Record<AgentStatus, { label: string; color: string; dotColor: string; hex: string }> = {
  done:          sc("done",         "Done"),
  "in-review":   sc("in-review",    "In review"),
  "draft-pr":    sc("draft-pr",     "Draft PR"),
  "in-progress": sc("in-progress",  "In progress"),
  backlog:       sc("backlog",      "Backlog"),
  cancelled:     sc("cancelled",    "Canceled"),
}

export const statusOrder: AgentStatus[] = ["in-progress", "draft-pr", "in-review", "backlog", "done", "cancelled"]

// ── WebSocket events emitted by the agents domain ────────────────────────────
// Composed into the top-level `ServerEvent` union in `../../ws.ts`.
// PR status on agent events is the same shape as on the entity.
export type { PRStatus }

export type AgentsServerEvent =
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
  | { type: "ports:changed";    ports: Array<{ agentId: string; agentTitle: string; port: number }> }
