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
import { slashCommandsRoutes } from "./routes/slashCommands.js"
import { fsRoutes } from "./routes/fs.js"
import { githubRoutes } from "./routes/github.js"
import { uploadRoutes } from "./routes/upload.js"
import { feedbackRoutes } from "./routes/feedback.js"
import { settingsRoutes } from "./routes/settings.js"
import { registerSocket } from "./ws/handler.js"
import { registerPtySocket } from "./ws/pty.js"
import { authHook } from "./auth.js"
import { registerAuditLog } from "./audit.js"
import { startPoller } from "./poller.js"

const app = Fastify({ logger: true })

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
  instance.get<{ Params: { agentId: string } }>("/ws/pty/:agentId", { websocket: true }, (socket, req) => {
    registerPtySocket(socket, req.params.agentId)
  })
})

// REST routes
await app.register(reposRoutes)
await app.register(agentsRoutes)
await app.register(messagesRoutes)
await app.register(filesRoutes)
await app.register(terminalRoutes)
await app.register(slashCommandsRoutes)
await app.register(fsRoutes)
await app.register(githubRoutes)
await app.register(uploadRoutes)
await app.register(feedbackRoutes)
await app.register(settingsRoutes)

// Health check
app.get("/health", async () => ({ status: "ok", version: "0.0.0" }))

// Server capabilities — exposes feature flags to the client (no secrets)
app.get("/api/config", async () => ({
  githubEnabled: !!config.githubToken,
  feedbackEnabled: !!config.feedbackRepo && !!config.githubToken,
}))

// Startup — try requested port, then increment up to 10 times on EADDRINUSE
runMigrations()

let boundPort: number | null = null
for (let attempt = 0; attempt < 10; attempt++) {
  const port = config.port + attempt
  try {
    await app.listen({ port, host: "0.0.0.0" })
    boundPort = port
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
const cleanupPortFile = () => { try { fs.unlinkSync(PORT_FILE) } catch { /* ignore */ } }
process.on("exit", cleanupPortFile)
process.on("SIGTERM", () => { cleanupPortFile(); process.exit(0) })
process.on("SIGINT", () => { cleanupPortFile(); process.exit(0) })

startPoller()
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
