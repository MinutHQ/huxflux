import { createRequire } from "node:module"
import * as path from "node:path"
import * as fs from "node:fs"

// Load node-pty gracefully. If the native binary isn't available (e.g. unsupported
// Node version, missing prebuilds), the server still starts but terminals won't work.
let pty: typeof import("@homebridge/node-pty-prebuilt-multiarch") | null = null
try {
  pty = await import("@homebridge/node-pty-prebuilt-multiarch")

  // pnpm strips execute permissions from prebuilt binaries in tarballs.
  // Fix spawn-helper at startup so the PTY can spawn processes on macOS/Linux.
  const _require = createRequire(import.meta.url)
  const ptyPkg = path.dirname(_require.resolve("@homebridge/node-pty-prebuilt-multiarch/package.json"))
  const helper = path.join(ptyPkg, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper")
  if (fs.existsSync(helper) && !(fs.statSync(helper).mode & 0o111)) {
    fs.chmodSync(helper, 0o755)
  }
} catch {
  console.warn("[pty] node-pty not available. Terminal feature disabled. This is normal on unsupported Node versions.")
}

import type { WebSocket } from "@fastify/websocket"
import { db } from "../../db/index.js"
import { agents, repos } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import { scanForPort, registerPort, clearAgentPorts } from "../git/processes.js"

type PtyMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "kill" }

const OUTPUT_BUF_SIZE = 100_000 // ~100KB

interface PtyEntry {
  process: ReturnType<NonNullable<typeof pty>["spawn"]>
  outputBuf: string
  clients: Set<WebSocket>
}

// Key: `${agentId}:${terminalId}` — persists across WS reconnects
// PTY processes live until explicitly killed (user closes tab or agent deleted).
const globalPtyMap = new Map<string, PtyEntry>()

export function killTerminal(key: string): void {
  const entry = globalPtyMap.get(key)
  if (!entry) return
  globalPtyMap.delete(key)
  for (const ws of entry.clients) {
    try { ws.close() } catch { /* ignore */ }
  }
  try { entry.process.kill() } catch { /* already dead */ }
}

/** Kill all PTY processes belonging to an agent (call on agent delete). */
export function killAgentTerminals(agentId: string): void {
  for (const key of [...globalPtyMap.keys()]) {
    if (key.startsWith(agentId + ":")) killTerminal(key)
  }
}

/** True if any PTY process is alive for this agent. */
export function hasActivePty(agentId: string): boolean {
  const prefix = agentId + ":"
  for (const key of globalPtyMap.keys()) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

function attachClientHandlers(socket: WebSocket, entry: PtyEntry, key: string): void {
  socket.on("message", (raw: Buffer | string) => {
    try {
      const msg: PtyMessage = JSON.parse(raw.toString())
      if (msg.type === "input") {
        entry.process.write(msg.data)
      } else if (msg.type === "resize") {
        entry.process.resize(msg.cols, msg.rows)
      } else if (msg.type === "kill") {
        killTerminal(key)
      }
    } catch {
      // ignore malformed messages
    }
  })

  socket.on("close", () => {
    entry.clients.delete(socket)
    // Don't kill the process — it persists for reconnection or other clients
  })
}

export function registerPtySocket(socket: WebSocket, agentId: string, terminalId: string, fresh: boolean) {
  const key = `${agentId}:${terminalId}`

  // Reconnect to an existing PTY process
  const existing = globalPtyMap.get(key)
  if (existing) {
    // Replay the output buffer when the client signals a fresh xterm (page refresh
    // or first connect). We rely on the client's declaration rather than clients.size
    // because on fast refreshes the old socket's close event may not have fired yet,
    // making clients.size unreliable.
    if (fresh && existing.outputBuf) {
      socket.send(JSON.stringify({ type: "output", data: existing.outputBuf }))
    }
    existing.clients.add(socket)
    attachClientHandlers(socket, existing, key)
    return
  }

  // Resolve the worktree path for this agent
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()
  if (!agent) {
    socket.send(JSON.stringify({ type: "error", message: "Agent not found" }))
    socket.close()
    return
  }

  const repo = agent.repoId
    ? db.select().from(repos).where(eq(repos.id, agent.repoId)).get()
    : null

  const cwd = repo
    ? (agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location))
    : process.cwd()

  // Verify the directory exists before spawning
  if (!fs.existsSync(cwd)) {
    socket.send(JSON.stringify({ type: "error", message: `Worktree path does not exist: ${cwd}` }))
    socket.close()
    return
  }

  const shell = process.env.SHELL ?? "/bin/bash"

  if (!pty) {
    socket.send(JSON.stringify({ type: "error", message: "Terminal not available (node-pty not installed for this Node version)" }))
    socket.close()
    return
  }

  const ptyProcess = pty.spawn(shell, ["-l"], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd,
    env: { ...process.env, NODE_ENV: "development", HUXFLUX_WORKTREE: cwd, HUXFLUX_REPO: repo?.path ?? "", HUXFLUX_AGENT_ID: agentId } as Record<string, string>,
  })

  const entry: PtyEntry = { process: ptyProcess, outputBuf: "", clients: new Set([socket]) }
  globalPtyMap.set(key, entry)

  ptyProcess.onData((data) => {
    const e = globalPtyMap.get(key)
    if (!e) return
    e.outputBuf = (e.outputBuf + data).slice(-OUTPUT_BUF_SIZE)
    const msg = JSON.stringify({ type: "output", data })
    for (const ws of e.clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg)
    }
    // Detect ports from terminal output
    try {
      const port = scanForPort(data)
      if (port) registerPort(agentId, port)
    } catch { /* port scanning is best-effort */ }
  })

  ptyProcess.onExit(({ exitCode }) => {
    const e = globalPtyMap.get(key)
    globalPtyMap.delete(key)
    if (!e) return
    const msg = JSON.stringify({ type: "exit", exitCode })
    for (const ws of e.clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg)
    }
    // Clear ports when terminal exits
    try {
      clearAgentPorts(agentId)
    } catch { /* port cleanup is best-effort */ }
  })

  attachClientHandlers(socket, entry, key)
}
