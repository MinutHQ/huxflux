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

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".huxflux")

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  dbPath: process.env.DB_PATH ?? path.join(DEFAULT_DATA_DIR, "huxflux.db"),
  githubToken: process.env.GITHUB_TOKEN ?? "",
  workspacesBase: process.env.WORKSPACES_BASE ?? path.join(DEFAULT_DATA_DIR, "workspaces"),
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : true,
  // Set by the CLI on start. When absent (pnpm dev), auth is disabled.
  authToken: process.env.AUTH_TOKEN ?? "",
  sandbox: parseSandbox(),
}
