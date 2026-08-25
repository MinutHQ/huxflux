import "dotenv/config"
import * as os from "node:os"
import * as path from "node:path"
// eslint-disable-next-line no-restricted-imports -- one-shot cached probe; runs at most once when gh is authenticated, re-probes with 30s cooldown otherwise
import { execFileSync } from "node:child_process"
import type { SandboxConfig } from "./sandbox.js"

let _ghCliToken: string | undefined
let _ghCliProbeTime = 0
const GH_PROBE_COOLDOWN = 30_000

function parseSandbox(): SandboxConfig | undefined {
  if (!process.env.SANDBOX_CONFIG) return undefined
  try {
    return JSON.parse(process.env.SANDBOX_CONFIG) as SandboxConfig
  } catch {
    return undefined
  }
}

export const DATA_DIR = process.env.HUXFLUX_DIR?.trim()
  ? path.resolve(process.env.HUXFLUX_DIR.trim())
  : path.join(os.homedir(), "huxflux")

// Dev mode is determined by NODE_ENV, not by the presence of AUTH_TOKEN.
// Dev gets its own DB and workspaces so migrations during development
// never touch the production database.
export const isDev = process.env.NODE_ENV !== "production"

export const config = {
  port: parseInt(process.env.PORT ?? "4321", 10),
  dbPath: process.env.DB_PATH ?? path.join(DATA_DIR, isDev ? "huxflux-dev.db" : "huxflux.db"),
  get githubToken(): string {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    if (_ghCliToken) return _ghCliToken
    const now = Date.now()
    if (_ghCliToken === "" && now - _ghCliProbeTime < GH_PROBE_COOLDOWN) return ""
    _ghCliProbeTime = now
    try {
      _ghCliToken = execFileSync("gh", ["auth", "token"], { encoding: "utf-8", timeout: 5000 }).trim()
    } catch {
      _ghCliToken = ""
    }
    return _ghCliToken
  },
  feedbackRepo: process.env.FEEDBACK_REPO ?? "",
  workspacesBase: process.env.WORKSPACES_BASE ?? path.join(DATA_DIR, isDev ? "workspaces-dev" : "workspaces"),
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : true,
  // Set by the CLI on start. When absent (pnpm dev), auth is disabled.
  authToken: process.env.AUTH_TOKEN ?? "",
  sandbox: parseSandbox(),
  /** Actual port the server is listening on (set after bind). */
  boundPort: parseInt(process.env.PORT ?? "4321", 10),
  // ── Internet proxy tunnel (optional) ──────────────────────────────────────
  // When PROXY_URL is set, the server dials out to a public proxy over a secure
  // WebSocket so clients can reach it from anywhere. See src/domains/proxy-
  // connector. PROXY_URL is the proxy base (e.g. wss://proxy.example.com); the
  // connector appends the tunnel path. It authenticates via the OAuth device
  // flow (prints a sign-in URL on first run). The server's URL id is derived by
  // the proxy from a random key the connector generates on first run — it is not
  // configured here. PROXY_SERVER_NAME is the human label shown to clients
  // (defaults to the system hostname).
  proxyUrl: process.env.PROXY_URL ?? "",
  proxyServerName: process.env.PROXY_SERVER_NAME?.trim() || os.hostname(),
}
