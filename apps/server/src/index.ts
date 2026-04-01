import Fastify from "fastify"
import fastifyCors from "@fastify/cors"
import fastifyWebsocket from "@fastify/websocket"
import { config } from "./config.js"
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

// Audit log — append one line per request to ~/.huxflux/audit.log
registerAuditLog(app)

if (!config.authToken) {
  console.warn("\n⚠  AUTH_TOKEN not set — running without authentication (dev mode)\n")
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

// Health check
app.get("/health", async () => ({ status: "ok", version: "0.0.0" }))

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

startPoller()
console.log(`\nHuxflux server running on http://0.0.0.0:${boundPort}`)
console.log(`WebSocket: ws://0.0.0.0:${boundPort}/ws\n`)
if (boundPort !== config.port) {
  console.warn(`⚠  Started on port ${boundPort} (${config.port} was in use). Update your client URL if needed.\n`)
}
