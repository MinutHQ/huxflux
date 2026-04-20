import { exec } from "node:child_process"
import { promisify } from "node:util"
import * as path from "node:path"
import { db } from "../db/index.js"
import { agents, repos, agentPorts } from "../db/schema.js"
import { eq, and, isNull, inArray } from "drizzle-orm"
import { broadcast } from "../ws/handler.js"

const execAsync = promisify(exec)

// ── Port scanner background worker ──────────────────────────────────────────

let scanInterval: ReturnType<typeof setInterval> | null = null

/**
 * Start the background port scanner. Runs async lsof every 10s,
 * never blocks the event loop.
 */
export function startPortScanner() {
  // Initial scan after 2s (let server boot first)
  setTimeout(() => void scanPorts(), 2000)
  scanInterval = setInterval(() => void scanPorts(), 10_000)
}

export function stopPortScanner() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null }
}

/**
 * Async port scan — runs lsof in a child process, updates DB, broadcasts changes.
 * Never blocks the event loop.
 */
async function scanPorts(): Promise<void> {
  try {
    // Get all active agents with their worktree paths
    const activeAgents = db.select().from(agents)
      .where(and(isNull(agents.deletedAt), isNull(agents.parentAgentId), isNull(agents.taskId)))
      .all()
      .filter(a => a.repoId)

    if (activeAgents.length === 0) {
      // Clear any stale ports
      const existing = db.select().from(agentPorts).all()
      if (existing.length > 0) {
        db.delete(agentPorts).run()
        broadcast({ type: "ports:changed", ports: [] })
      }
      return
    }

    // Build agent location → id map
    const locationToAgent = new Map<string, { id: string; title: string }>()
    for (const agent of activeAgents) {
      const repo = db.select().from(repos).where(eq(repos.id, agent.repoId!)).get()
      if (!repo) continue
      const worktreePath = agent.noWorktree ? repo.path : path.join(repo.workspacesPath, agent.location)
      locationToAgent.set(worktreePath, { id: agent.id, title: agent.title })
    }

    if (locationToAgent.size === 0) return

    // Single async lsof call — find all listening ports and their PIDs
    const { stdout: listenOutput } = await execAsync(
      "lsof -i -P -n 2>/dev/null | grep LISTEN || true",
      { timeout: 5000 }
    ).catch(() => ({ stdout: "" }))

    // Get PIDs and their cwds
    const { stdout: cwdOutput } = await execAsync(
      "lsof -d cwd 2>/dev/null || true",
      { timeout: 5000 }
    ).catch(() => ({ stdout: "" }))

    // Map PID → cwd
    const pidToCwd = new Map<number, string>()
    for (const line of cwdOutput.split("\n")) {
      const match = line.match(/^\S+\s+(\d+)\s+\S+\s+cwd\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)/)
      if (match) pidToCwd.set(parseInt(match[1]), match[2].trim())
    }

    // Map PID → listening ports
    const pidToPorts = new Map<number, number[]>()
    for (const line of listenOutput.split("\n")) {
      if (!line) continue
      const pidMatch = line.match(/^\S+\s+(\d+)/)
      const portMatch = line.match(/:(\d+)\s/)
      if (pidMatch && portMatch) {
        const pid = parseInt(pidMatch[1])
        const port = parseInt(portMatch[1])
        if (port >= 1024 && port <= 65535) {
          const list = pidToPorts.get(pid) ?? []
          list.push(port)
          pidToPorts.set(pid, list)
        }
      }
    }

    // Match: PID cwd matches a worktree path → that agent has those ports
    const newPorts: Array<{ agentId: string; port: number }> = []
    for (const [pid, cwd] of pidToCwd) {
      const ports = pidToPorts.get(pid)
      if (!ports) continue
      // Check if this PID's cwd is inside any agent's worktree
      for (const [worktreePath, agent] of locationToAgent) {
        if (cwd === worktreePath || cwd.startsWith(worktreePath + "/")) {
          for (const port of ports) {
            newPorts.push({ agentId: agent.id, port })
          }
        }
      }
    }

    // Compare with DB and update if changed
    const existing = db.select().from(agentPorts).all()
    const existingSet = new Set(existing.map(e => `${e.agentId}:${e.port}`))
    const newSet = new Set(newPorts.map(e => `${e.agentId}:${e.port}`))

    const sameContent = existingSet.size === newSet.size && [...existingSet].every(k => newSet.has(k))
    if (sameContent) return

    // Update DB
    db.delete(agentPorts).run()
    for (const { agentId, port } of newPorts) {
      db.insert(agentPorts).values({ agentId, port }).run()
    }

    // Broadcast change
    const portsList = newPorts.map(p => {
      const agent = locationToAgent.get([...locationToAgent.entries()].find(([_, a]) => a.id === p.agentId)?.[0] ?? "")
      return { agentId: p.agentId, agentTitle: agent?.title ?? "", port: p.port }
    })
    broadcast({ type: "ports:changed", ports: portsList })
  } catch (err) {
    // Non-critical — just skip this scan cycle
  }
}

// ── API helpers (read from DB only — instant) ───────────────────────────────

/** Get all ports from DB — used by GET /api/ports */
export function getAllPortsFromDB(): Array<{ agentId: string; agentTitle: string; port: number }> {
  const rows = db.select().from(agentPorts).all()
  if (rows.length === 0) return []

  const agentIds = [...new Set(rows.map(r => r.agentId))]
  const agentRows = db.select().from(agents)
    .where(inArray(agents.id, agentIds))
    .all()
  const agentMap = new Map(agentRows.map(a => [a.id, a.title]))

  return rows.map(r => ({
    agentId: r.agentId,
    agentTitle: agentMap.get(r.agentId) ?? "",
    port: r.port,
  }))
}

/** Get ports for a specific agent from DB */
export function getAgentPortsFromDB(agentId: string): number[] {
  return db.select().from(agentPorts)
    .where(eq(agentPorts.agentId, agentId))
    .all()
    .map(r => r.port)
}

// ── Kill processes ──────────────────────────────────────────────────────────

/** Kill processes in a worktree — async, non-blocking */
export async function killWorktreeProcesses(worktreePath: string): Promise<{ killed: number }> {
  try {
    const { stdout } = await execAsync(
      `lsof -d cwd -c node -c python -c ruby -c java -c go 2>/dev/null | grep "${worktreePath}" || true`,
      { timeout: 3000 }
    )
    const pids = new Set<number>()
    for (const line of stdout.split("\n")) {
      const match = line.match(/^\S+\s+(\d+)/)
      if (match) {
        const pid = parseInt(match[1])
        if (pid !== process.pid) pids.add(pid)
      }
    }
    let killed = 0
    for (const pid of pids) {
      try { process.kill(pid, "SIGTERM"); killed++ } catch { /* dead */ }
    }
    // Trigger an immediate rescan
    setTimeout(() => void scanPorts(), 1000)
    return { killed }
  } catch {
    return { killed: 0 }
  }
}
