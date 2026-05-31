import { spawn } from "node:child_process"
import { v4 as uuid } from "uuid"
import { db } from "../../../db/index.js"
import { terminalLines } from "../../../db/schema.js"
import { agentsWs } from "../agents.ws.js"

/**
 * Run a repository's setup script in the given worktree. Streams stdout/stderr
 * as terminal lines so the user sees install/build progress live.
 */
export function runSetupScript(script: string, cwd: string, agentId: string, repoPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sh", ["-c", script], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        HUXFLUX_WORKTREE: cwd,
        HUXFLUX_AGENT_ID: agentId,
        HUXFLUX_REPO: repoPath ?? "",
      },
    })
    const persistLine = (line: string): void => {
      if (!line.trim()) return
      const ts = new Date().toISOString()
      db.insert(terminalLines).values({ id: uuid(), agentId, line: line.trim(), createdAt: ts }).run()
      agentsWs.terminalLine(agentId, line.trim())
    }
    proc.stdout?.on("data", (chunk: Buffer) => chunk.toString().split("\n").forEach(persistLine))
    proc.stderr?.on("data", (chunk: Buffer) => chunk.toString().split("\n").forEach(persistLine))
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Setup script exited with code ${code}`)))
    proc.on("error", reject)
  })
}
