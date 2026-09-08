import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

// One bounded, read-only RPC session. Never starts a model thread or turn.
export function readRateLimits(binary: string, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] })
    const lines = createInterface({ input: child.stdout })
    let settled = false
    const timer = setTimeout(() => finish(new Error("Codex usage request timed out")), timeoutMs)
    function finish(error: Error | null, result?: unknown) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      lines.close()
      child.stdin.end()
      child.kill()
      // Ensure an unresponsive app-server cannot accumulate between polls.
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 1_000)
      killTimer.unref()
      child.once("close", () => clearTimeout(killTimer))
      if (error) reject(error)
      else resolve(result)
    }
    function send(message: unknown) {
      child.stdin.write(`${JSON.stringify(message)}\n`)
    }
    child.on("error", () => finish(new Error("Codex executable unavailable")))
    child.stdin.on("error", () => finish(new Error("Codex usage connection closed")))
    child.on("exit", () => finish(new Error("Codex exited before returning usage")))
    lines.on("line", (line) => {
      if (settled) return
      try {
        const message = JSON.parse(line)
        if (message.id !== 0 && message.id !== 1) return
        if (message.error) return finish(new Error("Codex usage unavailable; check Codex sign-in"))
        if (message.id === 0) {
          send({ method: "initialized", params: {} })
          send({ method: "account/rateLimits/read", id: 1 })
        } else {
          finish(null, message.result)
        }
      } catch {
        finish(new Error("Invalid Codex usage response"))
      }
    })
    send({ method: "initialize", id: 0, params: {
      clientInfo: { name: "huxflux", title: "Huxflux", version: "1.0.0" },
    } })
  })
}
