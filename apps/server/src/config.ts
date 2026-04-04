import "dotenv/config"
import * as os from "node:os"
import * as path from "node:path"
import type { SandboxConfig } from "./sandbox.js"

function parseSandbox(): SandboxConfig | undefined {
  if (!process.env.SANDBOX_CONFIG) return undefined
  try {
    return JSON.parse(process.env.SANDBOX_CONFIG) as SandboxConfig
  } catch {
    return undefined
  }
}

export const DATA_DIR = path.join(os.homedir(), "huxflux")

// Dev mode is determined by NODE_ENV, not by the presence of AUTH_TOKEN.
// Dev gets its own DB and workspaces so migrations during development
// never touch the production database.
export const isDev = process.env.NODE_ENV !== "production"

export const config = {
  port: parseInt(process.env.PORT ?? (isDev ? "3002" : "3001"), 10),
  dbPath: process.env.DB_PATH ?? path.join(DATA_DIR, isDev ? "huxflux-dev.db" : "huxflux.db"),
  githubToken: process.env.GITHUB_TOKEN ?? "",
  feedbackRepo: process.env.FEEDBACK_REPO ?? "",
  workspacesBase: process.env.WORKSPACES_BASE ?? path.join(DATA_DIR, isDev ? "workspaces-dev" : "workspaces"),
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : true,
  // Set by the CLI on start. When absent (pnpm dev), auth is disabled.
  authToken: process.env.AUTH_TOKEN ?? "",
  sandbox: parseSandbox(),
}
