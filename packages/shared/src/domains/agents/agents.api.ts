import { z } from "zod/v4"
import { reqValidated, req, getApiBase, authHeaders } from "../../apiBase.js"
import {
  agentSchema,
  agentSummarySchema,
  fileChangeSchema,
  messageSchema,
  slashCommandSchema,
  workspaceStatsSchema,
  fileTreeNodeSchema,
  terminalTabSchema,
  agentPortEntrySchema,
  agentContextSchema,
  agentFileDiffSchema,
  systemSshInfoSchema,
  createAgentBodySchema,
  updateAgentBodySchema,
  sendMessageBodySchema,
  switchBranchBodySchema,
  renameBranchBodySchema,
  generateTitleBodySchema,
  answerBodySchema,
  saveFileContentBodySchema,
  openInBodySchema,
  uploadFileBodySchema,
  terminalTabUpdateBodySchema,
  type CreateAgentBody,
  type UpdateAgentBody,
  type SendMessageBody,
} from "./agents.types.js"

const portsResponseSchema = z.object({ ports: z.array(z.number()) })
const killedResponseSchema = z.object({ killed: z.number() })
const stoppedResponseSchema = z.object({ stopped: z.boolean() })
const okResponseSchema = z.object({ ok: z.boolean() })
const sendMessageResponseSchema = z.object({ status: z.string() })
const worktreePathResponseSchema = z.object({ path: z.string() })
const uploadResponseSchema = z.object({
  path: z.string(),
  name: z.string(),
  mimeType: z.string(),
})

// The mutating agent routes (create / update / switch-branch / rename-branch /
// generate-title) all return the raw DB row, which has no `messages`,
// `fileChanges`, `terminalOutput`, or `hasMore`. Validating against the full
// `agentSchema` would silently throw at runtime — use `agentSummarySchema`
// (same shape, minus the heavy collections) so the contract matches what the
// server actually emits.
const agentMutationResponseSchema = agentSummarySchema

export const agentsApi = {
  // Agents
  list: () => reqValidated(z.array(agentSummarySchema), "/api/agents"),
  get: (id: string) => reqValidated(agentSchema, `/api/agents/${id}`),
  sessions: (id: string) =>
    reqValidated(z.array(agentSummarySchema), `/api/agents/${id}/sessions`),
  ports: (id: string) =>
    reqValidated(portsResponseSchema, `/api/agents/${id}/ports`),
  allPorts: () => reqValidated(z.array(agentPortEntrySchema), "/api/ports"),
  killProcesses: (id: string) =>
    reqValidated(killedResponseSchema, `/api/agents/${id}/kill-processes`, { method: "POST" }),
  create: (body: CreateAgentBody) =>
    reqValidated(agentMutationResponseSchema, "/api/agents", {
      method: "POST",
      body: JSON.stringify(createAgentBodySchema.parse(body)),
      timeoutMs: 120_000,
    }),
  update: (id: string, body: UpdateAgentBody) =>
    reqValidated(agentMutationResponseSchema, `/api/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateAgentBodySchema.parse(body)),
    }),
  delete: (id: string) =>
    reqValidated(z.void(), `/api/agents/${id}`, { method: "DELETE" }),
  generateTitle: (id: string, body?: { branch?: boolean }) =>
    reqValidated(agentMutationResponseSchema, `/api/agents/${id}/generate-title`, {
      method: "POST",
      body: body ? JSON.stringify(generateTitleBodySchema.parse(body)) : undefined,
    }),
  stop: (id: string) =>
    reqValidated(stoppedResponseSchema, `/api/agents/${id}/stop`, { method: "POST" }),
  answerQuestion: (id: string, answers: Record<string, string>, toolUseId?: string) =>
    reqValidated(okResponseSchema, `/api/agents/${id}/answer`, {
      method: "POST",
      body: JSON.stringify(answerBodySchema.parse({ answers, toolUseId })),
    }),
  switchBranch: (id: string, branch: string, force?: boolean) =>
    reqValidated(agentMutationResponseSchema, `/api/agents/${id}/switch-branch`, {
      method: "POST",
      body: JSON.stringify(switchBranchBodySchema.parse({ branch, force })),
    }),
  renameBranch: (id: string, branch: string) =>
    reqValidated(agentMutationResponseSchema, `/api/agents/${id}/rename-branch`, {
      method: "POST",
      body: JSON.stringify(renameBranchBodySchema.parse({ branch })),
    }),

  // Stats
  stats: () => reqValidated(workspaceStatsSchema, "/api/stats"),

  // Messages
  listMessages: (agentId: string) =>
    reqValidated(z.array(messageSchema), `/api/agents/${agentId}/messages`),
  listMoreMessages: (agentId: string, before: string) =>
    reqValidated(
      z.array(messageSchema),
      `/api/agents/${agentId}/messages?before=${encodeURIComponent(before)}&limit=50`,
    ),
  sendMessage: (agentId: string, content: string, opts?: { planMode?: boolean; effort?: string }) => {
    const body: SendMessageBody = { content, ...opts }
    return reqValidated(sendMessageResponseSchema, `/api/agents/${agentId}/messages`, {
      method: "POST",
      body: JSON.stringify(sendMessageBodySchema.parse(body)),
    })
  },

  // Files
  files: (agentId: string) =>
    reqValidated(z.array(fileChangeSchema), `/api/agents/${agentId}/files`),
  // Plain-text endpoints — no JSON schema to validate.
  diff: (agentId: string, path: string) =>
    fetch(`${getApiBase()}/api/agents/${agentId}/files/diff?path=${encodeURIComponent(path)}`, {
      headers: authHeaders(),
    }).then((r) => r.text()),
  fileTree: (agentId: string, subPath?: string) =>
    reqValidated(
      z.array(fileTreeNodeSchema),
      subPath
        ? `/api/agents/${agentId}/files/tree?path=${encodeURIComponent(subPath)}`
        : `/api/agents/${agentId}/files/tree`,
    ),
  fileContent: (agentId: string, path: string) =>
    fetch(`${getApiBase()}/api/agents/${agentId}/files/content?path=${encodeURIComponent(path)}`, { headers: authHeaders() }).then((r) => r.text()),
  baseFileContent: (agentId: string, path: string) =>
    fetch(`${getApiBase()}/api/agents/${agentId}/files/base-content?path=${encodeURIComponent(path)}`, { headers: authHeaders() }).then((r) => r.text()),
  saveFileContent: (agentId: string, path: string, content: string) =>
    reqValidated(okResponseSchema, `/api/agents/${agentId}/files/content`, {
      method: "PUT",
      body: JSON.stringify(saveFileContentBodySchema.parse({ path, content })),
    }),
  refreshFiles: (agentId: string) =>
    reqValidated(z.array(fileChangeSchema), `/api/agents/${agentId}/files/refresh`, { method: "POST" }),
  openIn: (agentId: string, app: string) =>
    // Server responds with `{ ok, worktreePath }`; only `ok` matters to the
    // current callers, so validate the minimal shape and discard the rest.
    req<{ ok: boolean }>(`/api/agents/${agentId}/open-in`, {
      method: "POST",
      body: JSON.stringify(openInBodySchema.parse({ app })),
    }),
  allDiffs: (agentId: string) =>
    reqValidated(z.array(agentFileDiffSchema), `/api/agents/${agentId}/files/diffs`, { timeoutMs: 30_000 }),
  worktreePath: (agentId: string) =>
    reqValidated(worktreePathResponseSchema, `/api/agents/${agentId}/worktree-path`),
  context: (agentId: string) =>
    reqValidated(agentContextSchema, `/api/agents/${agentId}/context`, { timeoutMs: 20_000 }),

  // Terminal
  terminal: (agentId: string) =>
    reqValidated(z.array(z.string()), `/api/agents/${agentId}/terminal`),

  // Terminal Tabs
  terminalTabs: (agentId: string) =>
    reqValidated(z.array(terminalTabSchema), `/api/agents/${agentId}/terminal-tabs`),
  createTerminalTab: (agentId: string) =>
    reqValidated(terminalTabSchema, `/api/agents/${agentId}/terminal-tabs`, { method: "POST" }),
  updateTerminalTab: (agentId: string, terminalId: string, body: { label: string | null }) =>
    reqValidated(terminalTabSchema, `/api/agents/${agentId}/terminal-tabs/${encodeURIComponent(terminalId)}`, {
      method: "PATCH",
      body: JSON.stringify(terminalTabUpdateBodySchema.parse(body)),
    }),
  deleteTerminalTab: (agentId: string, terminalId: string) =>
    reqValidated(z.void(), `/api/agents/${agentId}/terminal-tabs/${encodeURIComponent(terminalId)}`, { method: "DELETE" }),

  // Slash commands
  slashCommands: (agentId?: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return agentId
      ? reqValidated(z.array(slashCommandSchema), `/api/agents/${agentId}/slash-commands${qs}`)
      : reqValidated(z.array(slashCommandSchema), `/api/slash-commands${qs}`)
  },

  // Upload (agent-scoped chat attachment)
  uploadFile: (agentId: string, name: string, data: string, mimeType: string) =>
    reqValidated(uploadResponseSchema, `/api/agents/${agentId}/upload`, {
      method: "POST",
      body: JSON.stringify(uploadFileBodySchema.parse({ name, data, mimeType })),
    }),

  // System (used by agent open-in-editor)
  systemSshInfo: () => reqValidated(systemSshInfoSchema, "/api/system/ssh-info"),
}
