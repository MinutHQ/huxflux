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
import { registerSocket } from "./ws/handler.js"

const app = Fastify({ logger: true })

await app.register(fastifyCors, {
  origin: config.corsOrigins,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
})

await app.register(fastifyWebsocket)

// WebSocket endpoint — clients subscribe to agent events here
app.register(async (instance) => {
  instance.get("/ws", { websocket: true }, (socket) => {
    registerSocket(socket)
  })
})

// REST routes
await app.register(reposRoutes)
await app.register(agentsRoutes)
await app.register(messagesRoutes)
await app.register(filesRoutes)
await app.register(terminalRoutes)
await app.register(slashCommandsRoutes)

// Health check
app.get("/health", async () => ({ status: "ok", version: "0.0.0" }))

// Startup
try {
  runMigrations()
  await app.listen({ port: config.port, host: "0.0.0.0" })
  console.log(`\nHive server running on http://0.0.0.0:${config.port}`)
  console.log(`WebSocket: ws://0.0.0.0:${config.port}/ws\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
