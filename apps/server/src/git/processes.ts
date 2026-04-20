import { execSync, exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

/**
 * Kill all processes whose cwd is inside the given worktree path.
 * Uses lsof -c to find processes by command, filtered by cwd.
 */
export function killWorktreeProcesses(worktreePath: string): { killed: number } {
  const pids = getWorktreePids(worktreePath)
  let killed = 0
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM")
      killed++
    } catch { /* already dead */ }
  }
  return { killed }
}

/** Get PIDs whose cwd is the worktree (not recursive — fast) */
function getWorktreePids(worktreePath: string): number[] {
  try {
    // Use lsof -d cwd to only check working directories, not all open files
    // This is MUCH faster than lsof +D which recursively scans all files
    const output = execSync(
      `lsof -d cwd -c node -c python -c ruby -c java -c go 2>/dev/null | grep "${worktreePath}" || true`,
      { encoding: "utf8", timeout: 3000 }
    ).trim()
    if (!output) return []
    const pids = new Set<number>()
    for (const line of output.split("\n")) {
      const match = line.match(/^\S+\s+(\d+)/)
      if (match) {
        const pid = parseInt(match[1])
        if (pid !== process.pid) pids.add(pid)
      }
    }
    return [...pids]
  } catch {
    return []
  }
}

/**
 * Get ports being listened on by processes in a worktree.
 * Uses a fast two-step approach: find PIDs by cwd, then check their ports.
 */
export function getWorktreePorts(worktreePath: string): number[] {
  const pids = getWorktreePids(worktreePath)
  if (pids.length === 0) return []

  try {
    const ports: number[] = []
    const lsofOutput = execSync(
      `lsof -i -P -n -a ${pids.map(p => `-p ${p}`).join(" ")} 2>/dev/null | grep LISTEN || true`,
      { encoding: "utf8", timeout: 3000 }
    ).trim()

    for (const line of lsofOutput.split("\n")) {
      if (!line) continue
      const portMatch = line.match(/:(\d+)\s/)
      if (portMatch) {
        const port = parseInt(portMatch[1])
        if (port >= 1024) ports.push(port)
      }
    }
    return [...new Set(ports)]
  } catch {
    return []
  }
}
