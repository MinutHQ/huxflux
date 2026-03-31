// Re-export from @hive/shared. Web initializes storage in main.tsx.
export {
  getServers,
  addServer,
  updateServer,
  removeServer,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
  parseConnectionString,
} from "@hive/shared"
export type { HiveServer } from "@hive/shared"
