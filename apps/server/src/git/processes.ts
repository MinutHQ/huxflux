import { execSync } from "node:child_process"

/**
 * Kill all processes whose cwd is inside the given worktree path.
 * Uses lsof to find processes with files open in the directory.
 */
export function killWorktreeProcesses(worktreePath: string): { killed: number; ports: number[] } {
  const killed: number[] = []
  const ports: number[] = []

  try {
    // Find all PIDs with the worktree as cwd
    const output = execSync(
      `lsof -t +D "${worktreePath}" 2>/dev/null || true`,
      { encoding: "utf8", timeout: 5000 }
    ).trim()

    if (!output) return { killed: 0, ports: [] }

    const pids = [...new Set(output.split("\n").map((p) => parseInt(p.trim())).filter((p) => !isNaN(p) && p > 0))]

    // Don't kill ourselves
    const myPid = process.pid
    const filteredPids = pids.filter((p) => p !== myPid)

    for (const pid of filteredPids) {
      try {
        process.kill(pid, "SIGTERM")
        killed.push(pid)
      } catch { /* already dead */ }
    }
  } catch { /* lsof not available or failed */ }

  // Also find listening ports in the worktree
  try {
    const output = execSync(
      `lsof -i -P -n 2>/dev/null | grep LISTEN | grep -v "^huxflux" || true`,
      { encoding: "utf8", timeout: 5000 }
    ).trim()

    for (const line of output.split("\n")) {
      if (!line) continue
      const pidMatch = line.match(/^\S+\s+(\d+)/)
      if (!pidMatch) continue
      const pid = parseInt(pidMatch[1])
      if (killed.includes(pid)) {
        const portMatch = line.match(/:(\d+)\s/)
        if (portMatch) ports.push(parseInt(portMatch[1]))
      }
    }
  } catch { /* ignore */ }

  return { killed: killed.length, ports }
}

/**
 * Get ports being listened on by processes in a worktree.
 */
export function getWorktreePorts(worktreePath: string): number[] {
  try {
    // Get PIDs with cwd in worktree
    const cwdOutput = execSync(
      `lsof -t -c . +D "${worktreePath}" 2>/dev/null || true`,
      { encoding: "utf8", timeout: 3000 }
    ).trim()

    if (!cwdOutput) return []
    const pids = new Set(cwdOutput.split("\n").map((p) => parseInt(p.trim())).filter((p) => !isNaN(p)))

    // Get listening ports for those PIDs
    const ports: number[] = []
    const lsofOutput = execSync(
      `lsof -i -P -n 2>/dev/null | grep LISTEN || true`,
      { encoding: "utf8", timeout: 3000 }
    ).trim()

    for (const line of lsofOutput.split("\n")) {
      if (!line) continue
      const pidMatch = line.match(/^\S+\s+(\d+)/)
      if (!pidMatch) continue
      const pid = parseInt(pidMatch[1])
      if (pids.has(pid)) {
        const portMatch = line.match(/:(\d+)\s/)
        if (portMatch) {
          const port = parseInt(portMatch[1])
          if (port >= 1024) ports.push(port)
        }
      }
    }

    return [...new Set(ports)]
  } catch {
    return []
  }
}
