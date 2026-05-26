import Fastify from "fastify"
import fastifyCors from "@fastify/cors"
import fastifyWebsocket from "@fastify/websocket"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { config, isDev } from "./config.js"
import { toString as qrToString } from "qrcode"

const PORT_FILE = path.join(os.homedir(), "huxflux", isDev ? "server-dev.port" : "server.port")
import { runMigrations } from "./db/index.js"
import { reposRoutes } from "./routes/repos.js"
import { agentsRoutes } from "./routes/agents.js"
import { messagesRoutes } from "./routes/messages.js"
import { filesRoutes } from "./routes/files.js"
import { terminalRoutes } from "./routes/terminal.js"
import { terminalTabsRoutes } from "./routes/terminalTabs.js"
import { slashCommandsRoutes } from "./routes/slashCommands.js"
import { fsRoutes } from "./routes/fs.js"
import { githubRoutes } from "./routes/github.js"
import { uploadRoutes } from "./routes/upload.js"
import { feedbackRoutes } from "./routes/feedback.js"
import { settingsRoutes } from "./routes/settings.js"
import { statsRoutes } from "./routes/stats.js"
import { wrappedRoutes } from "./routes/wrapped.js"
import { systemRoutes } from "./routes/system.js"
import { tasksRoutes } from "./routes/tasks.js"
import { registerAutomationRoutes, startScheduler } from "./routes/automations.js"
import { registerSocket } from "./ws/handler.js"
import { registerPtySocket } from "./ws/pty.js"
import { authHook } from "./auth.js"
import { registerAuditLog } from "./audit.js"
import { startPoller } from "./poller.js"
import { resetStreamingFlags } from "./claude/runner.js"
import { watchWorktree, refreshWorktree } from "./git/watcher.js"
import { db } from "./db/index.js"
import { agents as agentsTable, repos as reposTable } from "./db/schema.js"
import { isNull, eq } from "drizzle-orm"

// pino-pretty is a dev dependency — only use it if available
let hasPinoPretty = false
if (isDev) {
  try { await import("pino-pretty"); hasPinoPretty = true } catch {}
}

const app = Fastify({
  logger: isDev && hasPinoPretty
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,reqId", singleLine: true } } }
    : true,
})

await app.register(fastifyCors, {
  origin: config.corsOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
})

await app.register(fastifyWebsocket)

// Auth — enforced on all routes when AUTH_TOKEN is set
app.addHook("preHandler", authHook)

// Audit log — append one line per request to ~/huxflux/audit.log
registerAuditLog(app)

if (!config.authToken) {
  console.error("\n✖  AUTH_TOKEN is not set. All API requests will be rejected.\n  Set AUTH_TOKEN in your .env file.\n")
}

// WebSocket endpoint — clients subscribe to agent events here
app.register(async (instance) => {
  instance.get("/ws", { websocket: true }, (socket) => {
    registerSocket(socket)
  })
  instance.get<{ Params: { agentId: string }; Querystring: { terminalId?: string; fresh?: string } }>("/ws/pty/:agentId", { websocket: true }, (socket, req) => {
    const q = req.query as { terminalId?: string; fresh?: string }
    const terminalId = q.terminalId ?? "t1"
    const fresh = q.fresh === "1"
    registerPtySocket(socket, req.params.agentId, terminalId, fresh)
  })
})

// REST routes
await app.register(reposRoutes)
await app.register(agentsRoutes)
await app.register(messagesRoutes)
await app.register(filesRoutes)
await app.register(terminalRoutes)
await app.register(terminalTabsRoutes)
await app.register(slashCommandsRoutes)
await app.register(fsRoutes)
await app.register(githubRoutes)
await app.register(uploadRoutes)
await app.register(feedbackRoutes)
await app.register(settingsRoutes)
await app.register(statsRoutes)
await app.register(wrappedRoutes)
await app.register(systemRoutes)
await app.register(tasksRoutes)
registerAutomationRoutes(app)

// Health check
app.get("/health", async () => ({ status: "ok", version: "0.0.0" }))

// Server capabilities — exposes feature flags to the client (no secrets)
app.get("/api/config", async () => ({
  githubEnabled: !!config.githubToken,
  feedbackEnabled: !!config.feedbackRepo && !!config.githubToken,
}))

// Startup — try requested port, then increment up to 10 times on EADDRINUSE
runMigrations()
startScheduler()

// Clear any stale streaming=1 rows from a previous crashed/killed process.
// The in-memory runningProcesses Map starts empty, so any row claiming to
// stream is a leftover that would otherwise show stuck loading indicators.
resetStreamingFlags()

// Ensure each repo with a setup script has one hidden reserve worktree
import { initializeReserves } from "./git/pool.js"
initializeReserves().catch((err) => console.error("[reserve] initialization failed:", err))


// Re-attach file watchers and do an initial scan for all active agents
{
  const activeAgents = db.select().from(agentsTable).where(isNull(agentsTable.deletedAt)).all()
  void (async () => {
    for (const agent of activeAgents) {
      if (!agent.repoId || agent.noWorktree) continue
      const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
      if (!repo) continue
      const worktreePath = path.join(repo.workspacesPath, agent.location)
      if (!fs.existsSync(worktreePath)) continue
      const effectiveBase = agent.baseBranch ?? repo.branchFrom
      watchWorktree(agent.id, worktreePath, effectiveBase)
      // Populate file changes so they show up without needing a new agent run
      await refreshWorktree(agent.id, worktreePath, effectiveBase).catch(() => {})
    }
  })()
}

let boundPort: number | null = null
for (let attempt = 0; attempt < 10; attempt++) {
  const port = config.port + attempt
  try {
    await app.listen({ port, host: "0.0.0.0" })
    boundPort = port
    config.boundPort = port
    break
  } catch (err: any) {
    if (err?.code === "EADDRINUSE") {
      console.warn(`[server] Port ${port} in use, trying ${port + 1}…`)
    } else {
      app.log.error(err)
      process.exit(1)
    }
  }
}

if (!boundPort) {
  console.error(`[server] Could not bind to any port in range ${config.port}–${config.port + 9}`)
  process.exit(1)
}

// Persist actual port so CLI commands can read it
try { fs.writeFileSync(PORT_FILE, String(boundPort)) } catch { /* non-fatal */ }

// Write connection.json so desktop/web can auto-discover this server
const CONNECTION_FILE = path.join(os.homedir(), "huxflux", "connection.json")
try {
  fs.writeFileSync(CONNECTION_FILE, JSON.stringify({
    url: `http://localhost:${boundPort}`,
    token: config.authToken || "",
    pid: process.pid,
    version: "0.2.33",
    port: boundPort,
  }, null, 2))
} catch { /* non-fatal */ }

const cleanupPortFile = () => {
  try { fs.unlinkSync(PORT_FILE) } catch { /* ignore */ }
  try { fs.unlinkSync(CONNECTION_FILE) } catch { /* ignore */ }
}

// Kill all agent processes and clear port records on shutdown
import { killWorktreeProcesses, clearAgentPorts } from "./git/processes.js"
async function cleanupOnShutdown() {
  cleanupPortFile()
  try {
    const allAgents = db.select().from(agentsTable).where(isNull(agentsTable.deletedAt)).all()
    for (const agent of allAgents) {
      if (!agent.repoId) continue
      const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
      if (!repo) continue
      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      await killWorktreeProcesses(worktreePath).catch(() => {})
      clearAgentPorts(agent.id)
    }
  } catch { /* best effort */ }
}

process.on("exit", cleanupPortFile)
process.on("SIGTERM", () => { void cleanupOnShutdown().finally(() => process.exit(0)) })
process.on("SIGINT", () => { void cleanupOnShutdown().finally(() => process.exit(0)) })

startPoller()
if (!process.env.HUXFLUX_SSH_USER) {
  console.log("[huxflux] SSH not configured. Set HUXFLUX_SSH_HOST and HUXFLUX_SSH_USER to enable remote editor launch.")
}
console.log(`\nHuxflux server running on http://0.0.0.0:${boundPort}`)
if (boundPort !== config.port) {
  console.warn(`⚠  Started on port ${boundPort} (${config.port} was in use). Update your client URL if needed.\n`)
}
if (config.authToken) {
  // Prefer Tailscale CGNAT range (100.64.0.0/10) — works on macOS and Linux
  const allIpv4 = Object.values(os.networkInterfaces()).flat()
    .filter((i): i is os.NetworkInterfaceInfo =>
      i != null && !i.internal && (i.family === "IPv4" || (i.family as unknown) === 4)
    ).map((i) => i.address)
  const lanIp = allIpv4.find((ip) => { const [a, b] = ip.split(".").map(Number); return a === 100 && b >= 64 && b <= 127 })
    ?? allIpv4[0] ?? "localhost"
  const connStr = `huxflux://${lanIp}:${boundPort}?token=${config.authToken}`
  console.log(`\n  Connect: ${connStr}\n`)
  try {
    const qr = await qrToString(connStr, { type: "terminal", small: true } as any)
    console.log(`  Scan to connect on mobile:\n`)
    console.log(qr)
  } catch { /* non-fatal */ }
}
