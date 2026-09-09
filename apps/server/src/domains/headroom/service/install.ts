import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import type { HeadroomInstallState } from "@huxflux/shared"
import { logger } from "../../../logger.js"

const execFileAsync = promisify(execFile)

/**
 * Unattended install of the `headroom` CLI. Picks the first available Python
 * tool installer (`uv`, then `pipx`), runs it as a detached-from-request
 * child, and keeps a bounded log tail so the UI can show progress. One
 * install at a time; state lives in module scope for the server's lifetime.
 */
export const HEADROOM_PACKAGE = "headroom-ai[all]"
const LOG_TAIL = 40
const PATH_PREFIX = `/opt/homebrew/bin:/usr/local/bin:${process.env.HOME ?? ""}/.local/bin`

export interface InstallerSpec {
  bin: string
  args: string[]
}

const INSTALLERS: Array<{ name: string; bin: string; args: string[] }> = [
  { name: "uv", bin: "uv", args: ["tool", "install", "--python", "3.13", HEADROOM_PACKAGE] },
  { name: "pipx", bin: "pipx", args: ["install", "--python", "python3.13", HEADROOM_PACKAGE] },
]

let installerOverride: (InstallerSpec & { name: string }) | null = null
/** Test seam: run this instead of uv/pipx. */
export function _setInstallerOverride(spec: typeof installerOverride): void { installerOverride = spec }

const state: HeadroomInstallState & { child: ReturnType<typeof spawn> | null } = {
  state: "idle", installer: null, command: null, log: [], error: null, child: null,
}

export function getInstallState(): HeadroomInstallState {
  const { child: _child, ...rest } = state
  return { ...rest, log: [...rest.log] }
}

export function _resetInstallState(): void {
  state.child?.kill("SIGKILL")
  Object.assign(state, { state: "idle", installer: null, command: null, log: [], error: null, child: null })
}

export async function detectInstaller(): Promise<(InstallerSpec & { name: string }) | null> {
  if (installerOverride) return installerOverride
  for (const candidate of INSTALLERS) {
    try {
      await execFileAsync("which", [candidate.bin], { env: { ...process.env, PATH: `${PATH_PREFIX}:${process.env.PATH ?? ""}` } })
      return candidate
    } catch { /* try next */ }
  }
  return null
}

function pushLog(line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
  state.log.push(trimmed)
  if (state.log.length > LOG_TAIL) state.log.splice(0, state.log.length - LOG_TAIL)
}

/**
 * Start the install. Resolves as soon as the child is spawned (the UI polls
 * `getInstallState()` for progress). `onDone` fires with success/failure so
 * the caller can refresh binary availability.
 */
export async function startInstall(onDone: (ok: boolean) => void): Promise<HeadroomInstallState> {
  if (state.state === "running") return getInstallState()
  const installer = await detectInstaller()
  if (!installer) {
    Object.assign(state, {
      state: "failed", installer: null, command: null, log: [],
      error: "No Python tool installer found. Install uv (https://docs.astral.sh/uv/) or pipx, then retry.",
    })
    return getInstallState()
  }
  const command = [installer.bin, ...installer.args].join(" ")
  Object.assign(state, { state: "running", installer: installer.name, command, log: [], error: null })
  logger.info({ command }, "[headroom] installing CLI")

  const child = spawn(installer.bin, installer.args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${PATH_PREFIX}:${process.env.PATH ?? ""}` },
  })
  state.child = child
  const onData = (chunk: Buffer) => { for (const line of chunk.toString().split("\n")) pushLog(line) }
  child.stdout?.on("data", onData)
  child.stderr?.on("data", onData)
  child.on("error", (err) => {
    Object.assign(state, { state: "failed", error: `Failed to run ${installer.bin}: ${err.message}`, child: null })
    logger.warn({ err }, "[headroom] install spawn failed")
    onDone(false)
  })
  child.on("exit", (code, signal) => {
    if (state.child !== child) return // reset while running
    state.child = null
    if (code === 0) {
      state.state = "succeeded"
      logger.info("[headroom] CLI installed")
      onDone(true)
    } else {
      state.state = "failed"
      state.error = `${installer.bin} exited with ${signal ?? `code ${code}`}. ${state.log.at(-1) ?? ""}`.trim()
      logger.warn({ code, signal }, "[headroom] install failed")
      onDone(false)
    }
  })
  return getInstallState()
}
