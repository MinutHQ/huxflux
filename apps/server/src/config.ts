import "dotenv/config"
import type { SandboxConfig } from "./sandbox.js"

function parseSandbox(): SandboxConfig | undefined {
  if (!process.env.SANDBOX_CONFIG) return undefined
  try {
    return JSON.parse(process.env.SANDBOX_CONFIG) as SandboxConfig
  } catch {
    return undefined
  }
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  dbPath: process.env.DB_PATH ?? `${process.env.HOME}/.huxflux/huxflux.db`,
  githubToken: process.env.GITHUB_TOKEN ?? "",
  workspacesBase: process.env.WORKSPACES_BASE ?? `${process.env.HOME}/.huxflux/workspaces`,
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : true,
  // Set by the CLI on start. When absent (pnpm dev), auth is disabled.
  authToken: process.env.AUTH_TOKEN ?? "",
  sandbox: parseSandbox(),
}
