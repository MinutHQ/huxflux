// Top-level barrel for `@huxflux/shared`. This is the ONE barrel that
// survives the per-domain-barrel removal: it re-exports symbols directly
// from each domain's top-level files. There is no `domains/<x>/index.ts`.
//
// Consumers import from `@huxflux/shared` only — never from internal paths.
// This file is the contract.

// ── Cross-cutting infrastructure ─────────────────────────────────────────────
export { configureStorage, getStorage } from "./storage.js"
export type { StorageAdapter } from "./storage.js"

export { parseUnifiedDiff, tokenize } from "./diff.js"
export type { DiffLine, DiffLineType, DiffToken } from "./diff.js"

export {
  connectBackgroundServer,
  useAgentEvents,
  useWsConnected,
  clientWs,
  clientEventSchema,
  subscribeEventSchema,
  unsubscribeEventSchema,
} from "./ws.js"
export type { ServerEvent, ClientEvent } from "./ws.js"

// ── Composed api object ──────────────────────────────────────────────────────
export { api, getApiBase } from "./api.js"

// ── Centralized TanStack Query keys ──────────────────────────────────────────
export { queryKeys } from "./queryKeys.js"

// ── React Query wrapper hooks ────────────────────────────────────────────────
// Use these everywhere instead of raw `useQuery` / `useMutation` so server-
// event reactions and post-mutation invalidations stay declarative.
export { useHuxfluxQuery } from "./useHuxfluxQuery.js"
export type {
  UseHuxfluxQueryOptions,
  EventHandlers,
  EventHandler,
  ReactiveQueryHelpers,
} from "./useHuxfluxQuery.js"
export { useHuxfluxMutation } from "./useHuxfluxMutation.js"
export type { UseHuxfluxMutationOptions } from "./useHuxfluxMutation.js"

// ── HTTP error shape (shared with the server) ────────────────────────────────
export { HuxfluxApiError, apiErrorSchema } from "./error.js"
export type { ApiError } from "./error.js"

// ── agents ───────────────────────────────────────────────────────────────────
export { agentsApi } from "./domains/agents/agents.api.js"
export { useAgent, configureAgentErrorHandler } from "./domains/agents/hooks/useAgent.js"
export { useAgents, markAgentDeleted } from "./domains/agents/hooks/useAgents.js"
export { isAgentStreaming } from "./domains/agents/agents.state.js"
export {
  statusConfig,
  statusOrder,
  agentSchema,
  agentSummarySchema,
  agentStatusSchema,
  messageSchema,
  toolCallSchema,
  fileChangeSchema,
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
  askBodySchema,
  answerBodySchema,
  saveFileContentBodySchema,
  openInBodySchema,
  uploadFileBodySchema,
  terminalTabUpdateBodySchema,
} from "./domains/agents/agents.types.js"
export type {
  Agent,
  AgentSummary,
  AgentStatus,
  Message,
  ToolCall,
  FileChange,
  SlashCommand,
  WorkspaceStats,
  FileTreeNode,
  TerminalTab,
  AgentPortEntry,
  AgentContext,
  AgentFileDiff,
  SystemSshInfo,
  CreateAgentBody,
  UpdateAgentBody,
  SendMessageBody,
  SwitchBranchBody,
  RenameBranchBody,
  GenerateTitleBody,
  AskBody,
  AnswerBody,
  SaveFileContentBody,
  OpenInBody,
  UploadFileBody,
  TerminalTabUpdateBody,
  AgentsServerEvent,
} from "./domains/agents/agents.types.js"

// ── settings ─────────────────────────────────────────────────────────────────
export { settingsApi } from "./domains/settings/settings.api.js"
export { settingsSchema, settingsDefaults } from "./domains/settings/settings.schema.js"
export type { SettingDef, SettingsSection, HuxfluxSettings } from "./domains/settings/settings.schema.js"
export {
  huxfluxSettingsSchema,
  partialHuxfluxSettingsSchema,
  providerInfoSchema,
  serverConfigSchema,
  serverVersionInfoSchema,
  updateResultSchema,
  feedbackRequestSchema,
  feedbackResponseSchema,
  githubStatusSchema,
} from "./domains/settings/settings.types.js"
export type {
  ProviderInfo,
  ServerConfig,
  ServerVersionInfo,
  UpdateResult,
  FeedbackRequest,
  FeedbackResponse,
  GitHubStatus,
} from "./domains/settings/settings.types.js"

// ── repos ────────────────────────────────────────────────────────────────────
export { reposApi } from "./domains/repos/repos.api.js"
export { useRepos } from "./domains/repos/repos.hooks.js"
export {
  repoSchema,
  createRepoBodySchema,
  updateRepoBodySchema,
  cloneRepoBodySchema,
  quickStartRepoBodySchema,
  fsRepoEntrySchema,
  fsBrowseResponseSchema,
  defaultBranchResponseSchema,
} from "./domains/repos/repos.types.js"
export type {
  Repo,
  CreateRepoBody,
  UpdateRepoBody,
  CloneRepoBody,
  QuickStartRepoBody,
  FsRepoEntry,
  FsBrowseResponse,
  DefaultBranchResponse,
} from "./domains/repos/repos.types.js"

// ── pull-requests ────────────────────────────────────────────────────────────
export { prsApi } from "./domains/pull-requests/pull-requests.api.js"
export {
  prStatusSchema,
  prReviewSchema,
  prReviewStateSchema,
  prCheckSchema,
  prCheckStatusSchema,
  prCheckConclusionSchema,
  prCommentSchema,
  prThreadSchema,
  prIssueCommentSchema,
  prDetailsSchema,
  openPRSchema,
  openPRWithRepoSchema,
  prFileSchema,
  prFileStatusSchema,
  prFileDiffSchema,
  codeLineSchema,
  reviewCommentSchema,
  pullRequestSchema,
  mergeMethodSchema,
  createPRBodySchema,
  mergePRBodySchema,
  replyToPRCommentBodySchema,
  singlePRCommentBodySchema,
  submitPRReviewBodySchema,
} from "./domains/pull-requests/pull-requests.types.js"
export type {
  PRStatus,
  PRReview,
  PRReviewState,
  PRCheck,
  PRCheckStatus,
  PRCheckConclusion,
  PRComment,
  PRThread,
  PRIssueComment,
  PRDetails,
  OpenPR,
  PRFile,
  PRFileStatus,
  CodeLine,
  ReviewComment,
  PullRequest,
  OpenPRWithRepo,
  PRFileDiff,
  MergeMethod,
  CreatePRBody,
  MergePRBody,
  ReplyToPRCommentBody,
  SinglePRCommentBody,
  SubmitPRReviewBody,
} from "./domains/pull-requests/pull-requests.types.js"

// ── tasks ────────────────────────────────────────────────────────────────────
export { tasksApi } from "./domains/tasks/tasks.api.js"
export {
  taskItemSchema,
  taskStatusSchema,
  taskCommentSchema,
  taskCommentRoleSchema,
  taskAgentSchema,
  taskAgentCIStatusSchema,
  createTaskBodySchema,
  updateTaskBodySchema,
  linkTaskAgentBodySchema,
  addTaskCommentBodySchema,
  syncTasksBodySchema,
  transitionTaskBodySchema,
  refineTaskBodySchema,
  addTaskDependencyBodySchema,
} from "./domains/tasks/tasks.types.js"
export type {
  TaskStatus,
  TaskComment,
  TaskCommentRole,
  TaskAgent,
  TaskAgentCIStatus,
  TaskItem,
  TasksServerEvent,
  CreateTaskBody,
  UpdateTaskBody,
  LinkTaskAgentBody,
  AddTaskCommentBody,
  SyncTasksBody,
  TransitionTaskBody,
  RefineTaskBody,
  AddTaskDependencyBody,
} from "./domains/tasks/tasks.types.js"

// ── servers ──────────────────────────────────────────────────────────────────
export {
  getServers,
  addServer,
  updateServer,
  removeServer,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
  parseConnectionString,
} from "./domains/servers/servers.store.js"
export { useServerStatus, useServerConfig } from "./domains/servers/servers.hooks.js"
export { huxfluxServerSchema, serverStatusSchema } from "./domains/servers/servers.types.js"
export type { HuxfluxServer, ServerStatus } from "./domains/servers/servers.types.js"

// ── wrapped ──────────────────────────────────────────────────────────────────
export { wrappedApi } from "./domains/wrapped/wrapped.api.js"
export { wrappedSummarySchema } from "./domains/wrapped/wrapped.types.js"
export type { WrappedSummary } from "./domains/wrapped/wrapped.types.js"

// ── automations ──────────────────────────────────────────────────────────────
export { automationsApi } from "./domains/automations/automations.api.js"
export {
  automationSchema,
  automationStatusSchema,
  automationStepSchema,
  automationStepTypeSchema,
  automationRunSchema,
  automationRunStatusSchema,
  automationSkillSchema,
  createAutomationBodySchema,
  updateAutomationBodySchema,
  replyToAutomationBuilderBodySchema,
} from "./domains/automations/automations.types.js"
export type {
  Automation,
  AutomationStep,
  AutomationStepType,
  AutomationRun,
  AutomationRunStatus,
  AutomationSkill,
  AutomationStatus,
  CreateAutomationBody,
  UpdateAutomationBody,
  ReplyToAutomationBuilderBody,
} from "./domains/automations/automations.types.js"
