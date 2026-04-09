// Types
export * from "./types"

// Storage
export { configureStorage, getStorage } from "./storage"
export type { StorageAdapter } from "./storage"

// Server store
export {
  getServers,
  addServer,
  updateServer,
  removeServer,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
  parseConnectionString,
} from "./serverStore"
export type { HuxfluxServer } from "./serverStore"

// API
export { api, getApiBase } from "./api"
export type { WorkspaceStats, WrappedSummary } from "./api"

// WebSocket
export { useAgentEvents, connectBackgroundServer, useWsConnected } from "./ws"
export type { ServerEvent } from "./ws"

// Agent state
export { isAgentStreaming } from "./agentState"

// Diff
export { parseUnifiedDiff, tokenize } from "./diff"
export type { DiffLine, DiffLineType, DiffToken } from "./diff"

// Hooks
export { useAgents, markAgentDeleted } from "./hooks/useAgents"
export { useAgent, configureAgentErrorHandler } from "./hooks/useAgent"
export { useRepos } from "./hooks/useRepos"
export { useServerStatus } from "./hooks/useServerStatus"
export type { ServerStatus } from "./hooks/useServerStatus"
export { useServerConfig } from "./hooks/useServerConfig"
