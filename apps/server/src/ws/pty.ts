import { createRequire } from "node:module"
import * as pty from "node-pty"
import * as path from "node:path"
import * as fs from "node:fs"

// pnpm strips execute permissions from prebuilt binaries in tarballs.
// Fix spawn-helper at startup so the PTY can spawn processes on macOS/Linux.
const _require = createRequire(import.meta.url)
try {
  const ptyPkg = path.dirname(_require.resolve("node-pty/package.json"))
  const helper = path.join(ptyPkg, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper")
  if (fs.existsSync(helper) && !(fs.statSync(helper).mode & 0o111)) {
    fs.chmodSync(helper, 0o755)
  }
} catch { /* not on a platform that needs it */ }
import type { WebSocket } from "@fastify/websocket"
import { db } from "../db/index.js"
import { agents, repos } from "../db/schema.js"
import { eq } from "drizzle-orm"

type PtyMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }

export function registerPtySocket(socket: WebSocket, agentId: string) {
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

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd,
    env: process.env as Record<string, string>,
  })

  ptyProcess.onData((data) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "output", data }))
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "exit", exitCode }))
      socket.close()
    }
  })

  socket.on("message", (raw: Buffer | string) => {
    try {
      const msg: PtyMessage = JSON.parse(raw.toString())
      if (msg.type === "input") {
        ptyProcess.write(msg.data)
      } else if (msg.type === "resize") {
        ptyProcess.resize(msg.cols, msg.rows)
      }
    } catch {
      // ignore malformed messages
    }
  })

  socket.on("close", () => {
    try { ptyProcess.kill() } catch { /* already dead */ }
  })
}
