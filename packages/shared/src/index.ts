// Types
export * from "./types"

// Storage
export { configureStorage } from "./storage"
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
export type { HiveServer } from "./serverStore"

// API
export { api, getApiBase } from "./api"

// WebSocket
export { useAgentEvents, connectBackgroundServer } from "./ws"
export type { ServerEvent } from "./ws"

// Diff
export { parseUnifiedDiff, tokenize } from "./diff"
export type { DiffLine, DiffLineType, DiffToken } from "./diff"

// Hooks
export { useAgents } from "./hooks/useAgents"
export { useAgent, configureAgentErrorHandler } from "./hooks/useAgent"
export { useRepos } from "./hooks/useRepos"
export { useServerStatus } from "./hooks/useServerStatus"
export type { ServerStatus } from "./hooks/useServerStatus"
