import Fastify from "fastify"
import type { FastifyBaseLogger } from "fastify"
import fastifyCors from "@fastify/cors"
import fastifyWebsocket from "@fastify/websocket"
import fastifySwagger from "@fastify/swagger"
import fastifySwaggerUi from "@fastify/swagger-ui"
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { config, isDev } from "./config.js"
import { logger } from "./logger.js"
import { toString as qrToString } from "qrcode"

import { SERVER_VERSION } from "./version.js"

// The CLI launches us with PORT set in our environment (serverEnv in cli.ts).
// config.ts has already read it into config.port above, so drop it now — otherwise
// every terminal, agent and setup script we spawn inherits PORT and clobbers the
// default port of any dev server started inside them.
delete process.env.PORT

// Force every git subprocess we spawn (reserve warm-up, worktree creation,
// fetches) to fail fast on credential / host-key prompts instead of hanging
// on a tty that doesn't exist. A single ungated `git fetch` over SSH against
// an unreachable remote was previously blocking requests for 30+ seconds
// (long enough for the desktop client to declare the server offline).
process.env.GIT_TERMINAL_PROMPT = process.env.GIT_TERMINAL_PROMPT ?? "0"
if (!process.env.GIT_SSH_COMMAND) {
  process.env.GIT_SSH_COMMAND = "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5"
}

const PORT_FILE = path.join(os.homedir(), "huxflux", isDev ? "server-dev.port" : "server.port")
import { runMigrations } from "./db/index.js"
import { domainPlugins } from "./domains/index.js"
import { fsRoutes } from "./fs-routes.js"
import { systemRoutes } from "./system-routes.js"
import { startScheduler } from "./domains/automations/scheduler.js"
import { registerSocket, onAgentSubscription } from "./domains/ws/handler.js"
import { registerPtySocket } from "./domains/ws/pty.js"
import { authHook } from "./auth.js"
import { registerAuditLog } from "./audit.js"
import { registerErrorHandler } from "./errorHandler.js"
import { startJobs } from "./jobs.js"
import { resetStreamingFlags } from "./domains/agent-runner/agent-runner.service.js"
import { watchAgent, unwatchWorktree } from "./domains/git/watcher.js"
import { db } from "./db/index.js"
import { agents as agentsTable, repos as reposTable } from "./db/schema.js"
import { isNull, eq } from "drizzle-orm"

// Fastify shares the one server-wide logger (pretty in dev, JSON in prod). See
// src/logger.ts. Request-lifecycle logs and operational logs go through the
// same instance and format.
const app = Fastify({
  // Cast to Fastify's own logger type: passing a concrete pino instance would
  // otherwise narrow Fastify's logger generic to pino's `Logger`, which clashes
  // with the `FastifyBaseLogger` its route/type-provider machinery expects.
  loggerInstance: logger as FastifyBaseLogger,
}).withTypeProvider<ZodTypeProvider>()

// Zod-based request validation + response serialization. Routes that pass a
// `schema` option to Fastify now get auto-validated bodies / querystrings /
// params, and response payloads are checked against the declared schema before
// being sent. The error handler below normalizes ZodError into the standard
// `{ code: "validation.failed", ... }` shape.
app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

await app.register(fastifyCors, {
  origin: config.corsOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
})

await app.register(fastifyWebsocket)

// OpenAPI / Swagger docs. The Zod schemas registered on each route are
// transformed into JSON Schema and exposed at /docs (interactive UI) and
// /docs/json (raw spec). The spec is auto-derived: adding a `schema` to a
// route automatically documents it.
await app.register(fastifySwagger, {
  openapi: {
    info: { title: "Huxflux API", version: SERVER_VERSION },
    servers: [{ url: "/" }],
  },
  transform: jsonSchemaTransform,
})

await app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
})

// Global error handler — normalises every error into the shared
// `{ code, message, details? }` shape. Registered before route plugins so
// thrown errors from any of them are caught.
registerErrorHandler(app)

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
// Domain-shaped plugins (auto-registered from src/domains/).
for (const plugin of domainPlugins) await app.register(plugin)
await app.register(fsRoutes)
await app.register(systemRoutes)

// Serve bundled web UI (if present in dist/web/)
// Static assets (JS/CSS/images) served by @fastify/static.
// index.html served with injected connection data for auto-connect.
const webDistDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "web")
if (fs.existsSync(webDistDir)) {
  const fastifyStatic = await import("@fastify/static")
  await app.register(fastifyStatic.default, {
    root: webDistDir,
    prefix: "/",
    decorateReply: false,
    serve: true,
    // Don't serve index.html for / (we handle it with injection below)
    index: false,
  })

  // Serve index.html with connection data injected
  const rawHtml = fs.readFileSync(path.join(webDistDir, "index.html"), "utf8")
  const connJson = JSON.stringify({ url: `http://127.0.0.1:${config.boundPort}`, token: config.authToken })
  const injection = `<script>window.__huxflux_connection=${JSON.stringify(connJson)}</script>`
  const injectedHtml = rawHtml.replace("</head>", `${injection}</head>`)

  app.get("/", async (_req, reply) => {
    return reply.code(200).header("Content-Type", "text/html").send(injectedHtml)
  })
}

// Health check
app.get("/health", async () => ({ status: "ok", version: SERVER_VERSION }))

// Server capabilities — exposes feature flags to the client (no secrets)
app.get("/api/config", async () => ({
  githubEnabled: !!config.githubToken,
  feedbackEnabled: !!config.feedbackRepo && !!config.githubToken,
}))

import { startUpdateChecker } from "./updater.js"

// Startup — try requested port, then increment up to 10 times on EADDRINUSE
runMigrations()
startScheduler()
startUpdateChecker()

// Clear any stale streaming=1 rows from a previous crashed/killed process.
// The in-memory runningProcesses Map starts empty, so any row claiming to
// stream is a leftover that would otherwise show stuck loading indicators.
resetStreamingFlags()

// Ensure each repo with a setup script has one hidden reserve worktree
import { initializeReserves } from "./domains/git/pool.js"
initializeReserves().catch((err) => logger.error({ err }, "[reserve] initialization failed"))

// Pre-resolve provider availability so the first GET /api/providers request
// doesn't trigger a 30+ second blocking `npx <pkg> --help` download inside
// `isAvailable()`. Fire-and-forget — each warm is async and caches in the
// underlying resolver. Without this, the first provider check would freeze
// every other HTTP/WS handler (including the user's terminal PTY upgrade).
import { warmAllProviders } from "./domains/providers/registry.js"
const providerWarmStart = Date.now()
warmAllProviders()
  .then(() => logger.info(`[providers] warm complete in ${Date.now() - providerWarmStart}ms`))
  .catch((err) => logger.error({ err }, "[providers] warm failed"))


// Attach git file watchers lazily: watch an agent's worktree only while a
// client has it open (first WS subscriber → watch, last unsubscribe → unwatch).
// Watching every agent on boot meant dozens of recursive polling watchers
// stat-ing thousands of files each, starving the event loop. The file-changes
// panel populates on subscribe via watchAgent's initial refresh.
onAgentSubscription((agentId, active) => {
  if (active) watchAgent(agentId)
  else unwatchWorktree(agentId)
})

let boundPort: number | null = null
for (let attempt = 0; attempt < 10; attempt++) {
  const port = config.port + attempt
  try {
    await app.listen({ port, host: "0.0.0.0" })
    boundPort = port
    config.boundPort = port
    break
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EADDRINUSE") {
      logger.warn(`[server] Port ${port} in use, trying ${port + 1}…`)
    } else {
      app.log.error(err)
      process.exit(1)
    }
  }
}

if (!boundPort) {
  logger.error(`[server] Could not bind to any port in range ${config.port}–${config.port + 9}`)
  process.exit(1)
}

// Persist actual port so CLI commands can read it
try { fs.writeFileSync(PORT_FILE, String(boundPort)) } catch { /* non-fatal */ }

// Write connection.json so desktop/web can auto-discover this server
const CONNECTION_FILE = path.join(os.homedir(), "huxflux", "connection.json")
try {
  fs.writeFileSync(CONNECTION_FILE, JSON.stringify({
    url: `http://127.0.0.1:${boundPort}`,
    token: config.authToken || "",
    pid: process.pid,
    version: SERVER_VERSION,
    port: boundPort,
  }, null, 2))
} catch { /* non-fatal */ }

const cleanupPortFile = () => {
  try { fs.unlinkSync(PORT_FILE) } catch { /* ignore */ }
  try { fs.unlinkSync(CONNECTION_FILE) } catch { /* ignore */ }
}

// Kill all agent processes and clear port records on shutdown
import { killWorktreeProcesses, clearAgentPorts } from "./domains/git/processes.js"
async function cleanupOnShutdown() {
  cleanupPortFile()
  try {
    const allAgents = db.select().from(agentsTable).where(isNull(agentsTable.deletedAt)).all()
    // Per-agent kill in parallel — each `lsof` already has a 3s timeout, so
    // total cleanup is bounded by the slowest single agent, not the sum.
    await Promise.all(allAgents.map(async (agent) => {
      if (!agent.repoId) return
      const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
      if (!repo) return
      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      await killWorktreeProcesses(worktreePath).catch(() => {})
      clearAgentPorts(agent.id)
    }))
  } catch { /* best effort */ }
}

// Belt-and-suspenders shutdown:
//   1. Hard timeout — if cleanup hangs (lsof stuck, db locked, whatever), the
//      process exits anyway. Without this, Ctrl+C looks like nothing happened.
//   2. Second-signal escape hatch — if the user hits Ctrl+C twice, exit
//      immediately without waiting on anything.
const SHUTDOWN_TIMEOUT_MS = 2000
let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) {
    logger.warn(`[server] received second ${signal}; forcing exit`)
    process.exit(1)
  }
  shuttingDown = true
  const force = setTimeout(() => {
    logger.warn(`[server] cleanup did not complete in ${SHUTDOWN_TIMEOUT_MS}ms; forcing exit`)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  // Don't let the timer itself hold the loop open if cleanup finishes fast.
  force.unref()
  void cleanupOnShutdown().finally(() => {
    clearTimeout(force)
    process.exit(0)
  })
}

process.on("exit", cleanupPortFile)
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))

startJobs()
if (!process.env.HUXFLUX_SSH_USER) {
  console.info("[huxflux] SSH not configured. Set HUXFLUX_SSH_HOST and HUXFLUX_SSH_USER to enable remote editor launch.")
}
console.info(`\nHuxflux server running on http://0.0.0.0:${boundPort}`)
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
  console.info(`\n  Connect: ${connStr}\n`)
  try {
    // qrcode's QRCodeToStringOptions type omits `small`, but the runtime accepts it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qr = await qrToString(connStr, { type: "terminal", small: true } as any)
    console.info(`  Scan to connect on mobile:\n`)
    console.info(qr)
  } catch { /* non-fatal */ }
}
