import { spawn, type ChildProcess } from "node:child_process"
import { logger } from "../../../logger.js"

/**
 * Lifecycle of one `headroom proxy` sidecar: spawn, wait for `/health`,
 * expose the URL, kill on demand. The service layer decides *when* to start
 * or stop; this file only knows *how*.
 *
 * `bin` + `argsPrefix` are separated so tests can point at
 * `process.execPath` + `[fake-headroom.mjs]` instead of the real CLI.
 */
export interface ProxySpawnSpec {
  bin: string
  /** Args placed before `--host/--port` (the real CLI needs `["proxy"]`). */
  argsPrefix: string[]
  host: string
  port: number
  /** Extra args after host/port (e.g. `--telemetry`). */
  extraArgs?: string[]
  env?: NodeJS.ProcessEnv
  healthTimeoutMs?: number
}

export interface ManagedProxy {
  url: string
  port: number
  child: ChildProcess
  /** Resolves once the child has exited (any reason). */
  exited: Promise<void>
  stop(): Promise<void>
}

export class ProxyStartError extends Error {
  constructor(public readonly reason: "exited" | "timeout", message: string) {
    super(message)
    this.name = "ProxyStartError"
  }
}

const HEALTH_POLL_MS = 250
const DEFAULT_HEALTH_TIMEOUT_MS = 60_000
const KILL_GRACE_MS = 1_000

export async function isProxyHealthy(url: string, timeoutMs = 1_000): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

/** Spawn the proxy and resolve once `/health` answers 200. Rejects (and kills
 *  the child) if the child exits early or health never comes up in time. */
export function startProxy(spec: ProxySpawnSpec): Promise<ManagedProxy> {
  const url = `http://${spec.host}:${spec.port}`
  const args = [...spec.argsPrefix, "--host", spec.host, "--port", String(spec.port), ...(spec.extraArgs ?? [])]
  const child = spawn(spec.bin, args, { stdio: ["ignore", "pipe", "pipe"], env: spec.env ?? process.env })

  child.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) if (line.trim()) logger.info(`[headroom] ${line}`)
  })
  child.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) if (line.trim()) logger.warn(`[headroom] ${line}`)
  })

  let exitedFlag = false
  const exited = new Promise<void>((resolve) => {
    child.once("exit", (code, signal) => {
      exitedFlag = true
      logger.info({ code, signal }, "[headroom] proxy exited")
      resolve()
    })
    child.once("error", () => { exitedFlag = true; resolve() })
  })

  const stop = (): Promise<void> => {
    if (exitedFlag) return Promise.resolve()
    child.kill("SIGTERM")
    const killTimer = setTimeout(() => { if (!exitedFlag) child.kill("SIGKILL") }, KILL_GRACE_MS)
    killTimer.unref()
    return exited.then(() => clearTimeout(killTimer))
  }

  return waitForHealth(url, spec.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS, () => exitedFlag)
    .then(() => ({ url, port: spec.port, child, exited, stop }))
    .catch(async (err: unknown) => {
      await stop()
      throw err
    })
}

async function waitForHealth(url: string, timeoutMs: number, hasExited: () => boolean): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (hasExited()) throw new ProxyStartError("exited", "headroom proxy exited before becoming healthy")
    if (await isProxyHealthy(url)) return
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
  }
  throw new ProxyStartError("timeout", `headroom proxy did not answer /health within ${timeoutMs}ms`)
}
