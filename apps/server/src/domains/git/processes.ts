import { exec } from "node:child_process"
import { promisify } from "node:util"
import { db } from "../../db/index.js"
import { agentPorts } from "../../db/schema.js"
import { agents } from "../../db/schema.js"
import { eq, inArray } from "drizzle-orm"
import { agentsWs } from "../agents/agents.ws.js"

const execAsync = promisify(exec)

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g

// ── Port detection from terminal output ─────────────────────────────────────

const PORT_PATTERNS = [
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/,
  /(?:port|PORT)[^\d]*(\d{4,5})/,
  /https?:\/\/localhost:(\d{4,5})/,
]

/**
 * Scan terminal output for port patterns.
 * Called from PTY handler on each output chunk.
 */
export function scanForPort(text: string): number | null {
  const clean = text.replace(ANSI_RE, "")
  for (const re of PORT_PATTERNS) {
    const m = clean.match(re)
    if (m) {
      const port = parseInt(m[1])
      if (port >= 1024 && port <= 65535) return port
    }
  }
  return null
}

/**
 * Register a detected port for an agent. Persists to DB and broadcasts.
 */
export function registerPort(agentId: string, port: number): void {
  // Check if already registered
  const existing = db.select().from(agentPorts)
    .where(eq(agentPorts.agentId, agentId))
    .all()
  if (existing.some(e => e.port === port)) return

  db.insert(agentPorts).values({ agentId, port }).run()

  // Broadcast updated ports
  broadcastPorts()
}

/**
 * Remove a port for an agent (e.g. terminal session closed).
 */
export function unregisterPort(agentId: string, port: number): void {
  db.delete(agentPorts)
    .where(eq(agentPorts.agentId, agentId))
    .run()

  // Re-insert remaining ports (sqlite doesn't support compound WHERE easily with drizzle)
  // Actually let's just delete all for this agent and re-add the others
  const remaining = db.select().from(agentPorts)
    .where(eq(agentPorts.agentId, agentId))
    .all()
    .filter(p => p.port !== port)

  // Simpler: delete all for agent, re-insert minus the one
  db.delete(agentPorts).where(eq(agentPorts.agentId, agentId)).run()
  for (const p of remaining) {
    db.insert(agentPorts).values({ agentId: p.agentId, port: p.port }).run()
  }

  broadcastPorts()
}

/**
 * Clear all ports for an agent (e.g. all terminals closed, agent archived).
 */
export function clearAgentPorts(agentId: string): void {
  const had = db.select().from(agentPorts).where(eq(agentPorts.agentId, agentId)).all()
  if (had.length === 0) return
  db.delete(agentPorts).where(eq(agentPorts.agentId, agentId)).run()
  broadcastPorts()
}

function broadcastPorts(): void {
  const all = getAllPortsFromDB()
  agentsWs.portsChanged(all)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function isPortAlive(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `lsof -i :${port} -P -n 2>/dev/null | grep LISTEN || true`,
      { encoding: "utf8", timeout: 2000 },
    )
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

function enrichPortRows(rows: Array<{ agentId: string; port: number }>): Array<{ agentId: string; agentTitle: string; port: number }> {
  if (rows.length === 0) return []
  const agentIds = [...new Set(rows.map(r => r.agentId))]
  const agentRows = db.select().from(agents).where(inArray(agents.id, agentIds)).all()
  const agentMap = new Map<string, string>(agentRows.map(a => [a.id, a.title ?? ""]))
  return rows.map(r => ({ agentId: r.agentId, agentTitle: agentMap.get(r.agentId) ?? "", port: r.port }))
}

// ── API helpers ────────────────────────────────────────────────────────────

export function getAllPortsFromDB(): Array<{ agentId: string; agentTitle: string; port: number }> {
  const rows = db.select().from(agentPorts).all()
  return enrichPortRows(rows)
}

export async function cleanDeadPorts(): Promise<void> {
  const rows = db.select().from(agentPorts).all()
  if (rows.length === 0) return

  const checks = await Promise.all(rows.map(async (row) => ({
    ...row,
    alive: await isPortAlive(row.port),
  })))

  const dead = checks.filter((c) => !c.alive)
  if (dead.length === 0) return

  for (const { agentId, port } of dead) {
    db.delete(agentPorts)
      .where(eq(agentPorts.agentId, agentId))
      .run()
    const remaining = rows.filter(
      (r) => r.agentId === agentId && r.port !== port && !dead.some((d) => d.agentId === r.agentId && d.port === r.port),
    )
    for (const r of remaining) {
      try { db.insert(agentPorts).values({ agentId: r.agentId, port: r.port }).run() } catch { /* dup */ }
    }
  }
  broadcastPorts()
}

export function getAgentPortsFromDB(agentId: string): number[] {
  return db.select().from(agentPorts)
    .where(eq(agentPorts.agentId, agentId))
    .all()
    .map(r => r.port)
}

// ── Kill processes (async, non-blocking) ────────────────────────────────────

export async function killWorktreeProcesses(worktreePath: string): Promise<{ killed: number }> {
  try {
    const { stdout } = await execAsync(
      `lsof -d cwd -c node -c python -c ruby -c java 2>/dev/null | grep "${worktreePath}" || true`,
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
    return { killed }
  } catch {
    return { killed: 0 }
  }
}
