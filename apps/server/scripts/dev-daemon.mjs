#!/usr/bin/env node
/**
 * Dev daemon — start/stop/logs for the huxflux server in dev mode.
 * Equivalent to `huxflux start/stop/logs` but uses dev env vars:
 *   - No AUTH_TOKEN (auth disabled)
 *   - Port 3002
 *   - ~/huxflux/huxflux-dev.db
 *   - ~/huxflux/workspaces-dev
 */

import { spawn } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DATA_DIR  = path.join(os.homedir(), "huxflux")
const PID_FILE  = path.join(DATA_DIR, "server-dev.pid")
const LOG_FILE  = path.join(DATA_DIR, "server-dev.log")

const TSX_BIN   = path.resolve(__dirname, "../node_modules/.bin/tsx")
const SRC_ENTRY = path.resolve(__dirname, "../src/index.ts")

const DEV_ENV = {
  ...process.env,
  NODE_ENV: "development",
  PORT: "3002",
  DB_PATH: path.join(DATA_DIR, "huxflux-dev.db"),
  WORKSPACES_BASE: path.join(DATA_DIR, "workspaces-dev"),
}

function getRunningPid() {
  if (!fs.existsSync(PID_FILE)) return null
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10)
  if (isNaN(pid)) return null
  try { process.kill(pid, 0); return pid } catch { fs.unlinkSync(PID_FILE); return null }
}

function cmdStart() {
  const existing = getRunningPid()
  if (existing) {
    console.log(`huxflux dev already running  (PID ${existing})`)
    console.log(`  Logs:  pnpm dev:logs`)
    console.log(`  Stop:  pnpm dev:stop`)
    process.exit(0)
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })

  const logFd = fs.openSync(LOG_FILE, "a")
  const child = spawn(TSX_BIN, [SRC_ENTRY], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: DEV_ENV,
  })
  child.unref()
  fs.closeSync(logFd)

  if (!child.pid) {
    console.error("Failed to start dev server")
    process.exit(1)
  }

  fs.writeFileSync(PID_FILE, String(child.pid))

  console.log(`\nhuxflux dev started  (PID ${child.pid})\n`)
  console.log(`  URL:   http://localhost:3002  (no auth token needed)`)
  console.log(`  DB:    ${DEV_ENV.DB_PATH}`)
  console.log(`  Logs:  ${LOG_FILE}`)
  console.log(`\n  pnpm dev:logs   — tail the server log`)
  console.log(`  pnpm dev:stop   — stop the server\n`)
}

function cmdStop() {
  const pid = getRunningPid()
  if (!pid) { console.log("huxflux dev is not running"); process.exit(0) }
  try { process.kill(pid, "SIGTERM") } catch { /* already gone */ }
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
  console.log(`huxflux dev stopped  (PID ${pid})`)
}

function cmdLogs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log("No dev logs yet. Run: pnpm dev:start")
    process.exit(1)
  }
  const tail = spawn("tail", ["-f", "-n", "100", LOG_FILE], { stdio: "inherit" })
  tail.on("close", (code) => process.exit(code ?? 0))
  process.on("SIGINT", () => { tail.kill(); process.exit(0) })
}

function cmdStatus() {
  const pid = getRunningPid()
  if (!pid) { console.log("huxflux dev  stopped\n  Run: pnpm dev:start"); return }
  console.log(`huxflux dev  running  (PID ${pid})`)
  console.log(`  URL:  http://localhost:3002`)
  console.log(`  DB:   ${DEV_ENV.DB_PATH}`)
  console.log(`  Logs: ${LOG_FILE}`)
}

const cmd = process.argv[2] ?? "start"
switch (cmd) {
  case "start":  cmdStart();  break
  case "stop":   cmdStop();   break
  case "logs":   cmdLogs();   break
  case "status": cmdStatus(); break
  default:
    console.error(`Unknown command: ${cmd}`)
    console.error("Usage: dev-daemon.mjs [start|stop|logs|status]")
    process.exit(1)
}
