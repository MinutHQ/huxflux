#!/usr/bin/env node
// __PKG_VERSION__ is injected at build time by tsup from package.json
declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== "undefined" ? __PKG_VERSION__ : "dev"

// Enforce Node.js version — 22.6+ required (LTS), 25+ not yet supported
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number)
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 6)) {
  console.error(`\nError: Huxflux requires Node.js 22.6 or later (you have ${process.versions.node})`)
  console.error(`\n  Fix with nvm:  nvm install 22 && nvm use 22`)
  console.error(`  Or download:   https://nodejs.org\n`)
  process.exit(1)
}
if (nodeMajor > 24) {
  console.warn(`\nWarning: Node.js ${process.versions.node} is not fully supported yet.`)
  console.warn(`  Terminal features may not work. Recommended: Node.js 22 (LTS).`)
  console.warn(`  Switch with nvm: nvm install 22 && nvm use 22\n`)
}

import { spawn, spawnSync } from "node:child_process"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as readline from "node:readline"
import { fileURLToPath } from "node:url"
import { isFirejailAvailable, sandboxStatus } from "./sandbox.js"
import type { SandboxConfig } from "./sandbox.js"
import { toString as qrToString } from "qrcode"

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_DIR     = process.env.HUXFLUX_DIR?.trim()
  ? path.resolve(process.env.HUXFLUX_DIR.trim())
  : path.join(os.homedir(), "huxflux") // keep in sync with config.ts DATA_DIR
const CONFIG_FILE  = path.join(DATA_DIR, "config.json")
const PID_FILE     = path.join(DATA_DIR, "server.pid")
const PORT_FILE    = path.join(DATA_DIR, "server.port")
const LOG_FILE     = path.join(DATA_DIR, "server.log")
const CRASH_LOG    = path.join(DATA_DIR, process.env.NODE_ENV === "development" ? "crash.dev.log" : "crash.log")
const DB_FILE      = path.join(DATA_DIR, "huxflux.db")
const DB_BAK       = DB_FILE + ".bak"
const DB_BAK2      = DB_FILE + ".bak2"
const WORKSPACES   = path.join(DATA_DIR, "workspaces")
const SERVER_ENTRY = path.join(fileURLToPath(import.meta.url), "../index.js")

// ── Config ────────────────────────────────────────────────────────────────────

interface Config {
  token: string
  port: number
  sandbox?: SandboxConfig
  disclaimerShown?: boolean
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadConfig(): Config {
  ensureDataDir()
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Config
  }
  const cfg: Config = {
    token: crypto.randomBytes(32).toString("hex"),
    port: 4321,
  }
  saveConfig(cfg)
  return cfg
}

function saveConfig(cfg: Config) {
  ensureDataDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

// ── Process management ────────────────────────────────────────────────────────

function getRunningPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null
  const raw = fs.readFileSync(PID_FILE, "utf8").trim()
  const pid = parseInt(raw, 10)
  if (isNaN(pid)) return null
  try {
    process.kill(pid, 0)
    return pid
  } catch {
    fs.unlinkSync(PID_FILE)
    return null
  }
}

function serverEnv(cfg: Config): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    AUTH_TOKEN: cfg.token,
    PORT: String(cfg.port),
    HUXFLUX_DIR: DATA_DIR,
    DB_PATH: process.env.DB_PATH ?? path.join(DATA_DIR, "huxflux.db"),
    WORKSPACES_BASE: process.env.WORKSPACES_BASE ?? path.join(DATA_DIR, "workspaces"),
    ...(cfg.sandbox ? { SANDBOX_CONFIG: JSON.stringify(cfg.sandbox) } : {}),
  }
}

// ── Connection string ─────────────────────────────────────────────────────────

function getActualPort(configPort: number): number {
  try {
    if (fs.existsSync(PORT_FILE)) {
      const p = parseInt(fs.readFileSync(PORT_FILE, "utf8").trim(), 10)
      if (!isNaN(p)) return p
    }
  } catch { /* fall through */ }
  return configPort
}

function connectionString(cfg: Config, host = "localhost"): string {
  return `huxflux://${host}:${getActualPort(cfg.port)}?token=${cfg.token}`
}

function getOutboundIp(): string {
  const allIpv4 = Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo =>
      i != null && !i.internal && (i.family === "IPv4" || (i.family as unknown) === 4)
    )
    .map((i) => i.address)
  // Prefer Tailscale CGNAT range (100.64.0.0/10) — works on macOS and Linux
  const tailscale = allIpv4.find((ip) => {
    const [a, b] = ip.split(".").map(Number)
    return a === 100 && b >= 64 && b <= 127
  })
  return tailscale ?? allIpv4[0] ?? "localhost"
}

async function printConnectInfo(cfg: Config, pid?: number) {
  const connStr = connectionString(cfg, getOutboundIp())
  console.info(`  Connection string (paste into Huxflux web app):`)
  console.info(`\n    ${connStr}\n`)
  try {
    // qrcode's QRCodeToStringOptions type omits `small`, but the runtime accepts it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qr = await qrToString(connStr, { type: "terminal", small: true } as any)
    console.info(`  Scan to connect on mobile:\n`)
    console.info(qr)
  } catch { /* non-fatal */ }
  if (pid) console.info(`  PID:     ${pid}`)
  console.info(`  Logs:    ${LOG_FILE}`)
  console.info(`  Sandbox: ${sandboxStatus(cfg.sandbox)}`)
}

// ── Security disclaimer ───────────────────────────────────────────────────────

function printDisclaimer() {
  console.info(`
  ┌─ Security recommendations ────────────────────────────────────┐
  │                                                               │
  │  The auth token grants full shell access to this machine.     │
  │  Treat it like an SSH private key — keep it secret.           │
  │                                                               │
  │  1. Run as a dedicated non-root user                          │
  │     Claude can read/write any file your OS user can access.   │
  │     Use a separate low-privilege user for huxflux.            │
  │                                                               │
  │  2. Use Tailscale for encryption in transit                   │
  │     Tailscale (WireGuard) encrypts all traffic for free.      │
  │     Without it, your token and data travel in plaintext.      │
  │     https://tailscale.com                                     │
  │                                                               │
  │  3. Never expose your server port to the public internet      │
  │     Use Caddy for automatic TLS if you need public access:    │
  │     https://caddyserver.com/docs/quick-starts/reverse-proxy   │
  │                                                               │
  │  4. Beware prompt injection                                   │
  │     Malicious content in a repo (README, comments, fixtures)  │
  │     can instruct Claude to run commands. Only use repos you   │
  │     trust.                                                    │
  │                                                               │
  │  5. Sandbox the Claude subprocess  (Linux only)               │
  │     Run 'huxflux sandbox' to restrict file/binary access.     │
  │                                                               │
  │  6. Rotate the token if it leaks                              │
  │     huxflux token rotate && huxflux stop && huxflux start     │
  │                                                               │
  │  7. Audit requests                                            │
  │     huxflux audit   — tail the request log                    │
  │                                                               │
  │  Run 'huxflux security' to see this again.                    │
  └───────────────────────────────────────────────────────────────┘
`.trimStart())
}

// ── Interactive sandbox setup ─────────────────────────────────────────────────

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

function printSandboxStatus(cfg: Config) {
  const sb = cfg.sandbox
  const firejail = isFirejailAvailable()

  console.info(`\nSandbox\n`)

  if (!sb?.enabled) {
    console.info(`  Status:  disabled`)
  } else if (os.platform() !== "linux") {
    console.info(`  Status:  unsupported on macOS`)
  } else if (!firejail) {
    console.info(`  Status:  enabled (firejail not installed — run: sudo apt install firejail)`)
  } else {
    console.info(`  Status:  active`)
  }

  const extras = sb?.allowedBinaries ?? []
  const builtins = ["git", "node", "claude", "sh", "bash", "curl"]
  console.info(`  Built-in binaries:  ${builtins.join(", ")}`)
  console.info(`  Extra binaries:     ${extras.length > 0 ? extras.join(", ") : "(none)"}`)
  console.info(`  Paths:              derived from registered repos + ${DATA_DIR}\n`)
  console.info(`Commands:`)
  console.info(`  huxflux sandbox add <bin> [bin...]   Allow extra binaries`)
  console.info(`  huxflux sandbox remove <bin>         Revoke a binary`)
  console.info(`  huxflux sandbox enable               Enable sandboxing`)
  console.info(`  huxflux sandbox disable              Disable sandboxing`)
  console.info(`  huxflux sandbox setup                Interactive first-time setup\n`)
}

async function cmdSandbox(sub?: string, ...rest: string[]) {
  const cfg = loadConfig()

  // No subcommand — show status
  if (!sub) {
    printSandboxStatus(cfg)
    return
  }

  if (sub === "add") {
    if (rest.length === 0) { console.error("Usage: huxflux sandbox add <bin> [bin...]"); process.exit(1) }
    const current = cfg.sandbox?.allowedBinaries ?? []
    const added = rest.filter((b) => !current.includes(b))
    if (added.length === 0) { console.info("Nothing to add — all listed binaries already allowed."); return }
    cfg.sandbox = { enabled: cfg.sandbox?.enabled ?? true, allowedBinaries: [...current, ...added] }
    saveConfig(cfg)
    console.info(`Added: ${added.join(", ")}`)
    console.info(`Allowed now: ${cfg.sandbox.allowedBinaries.join(", ")}`)
    console.info(`\nRestart to apply: huxflux stop && huxflux start`)
    return
  }

  if (sub === "remove") {
    if (rest.length === 0) { console.error("Usage: huxflux sandbox remove <bin>"); process.exit(1) }
    const current = cfg.sandbox?.allowedBinaries ?? []
    const next = current.filter((b) => !rest.includes(b))
    const removed = current.filter((b) => rest.includes(b))
    if (removed.length === 0) { console.info(`Not in allowed list: ${rest.join(", ")}`); return }
    cfg.sandbox = { enabled: cfg.sandbox?.enabled ?? true, allowedBinaries: next }
    saveConfig(cfg)
    console.info(`Removed: ${removed.join(", ")}`)
    console.info(`Allowed now: ${next.length > 0 ? next.join(", ") : "(none)"}`)
    console.info(`\nRestart to apply: huxflux stop && huxflux start`)
    return
  }

  if (sub === "enable") {
    cfg.sandbox = { enabled: true, allowedBinaries: cfg.sandbox?.allowedBinaries ?? [] }
    saveConfig(cfg)
    if (!isFirejailAvailable() && os.platform() === "linux") {
      console.info("Sandbox enabled — but firejail is not installed:")
      console.info("  sudo apt install firejail")
    } else {
      console.info("Sandbox enabled. Restart to apply: huxflux stop && huxflux start")
    }
    return
  }

  if (sub === "disable") {
    cfg.sandbox = { enabled: false, allowedBinaries: cfg.sandbox?.allowedBinaries ?? [] }
    saveConfig(cfg)
    console.info("Sandbox disabled. Restart to apply: huxflux stop && huxflux start")
    return
  }

  if (sub === "setup") {
    await cmdSandboxSetup(cfg)
    return
  }

  console.error(`Unknown sandbox subcommand: ${sub}`)
  printSandboxStatus(cfg)
  process.exit(1)
}

async function cmdSandboxSetup(cfg: Config) {
  if (os.platform() !== "linux") {
    console.info("Sandbox via firejail is only supported on Linux.")
    process.exit(0)
  }

  if (!isFirejailAvailable()) {
    console.info("\nfirejail is not installed:\n")
    console.info("  sudo apt install firejail     # Debian/Ubuntu")
    console.info("  sudo dnf install firejail     # Fedora/RHEL")
    console.info("  sudo pacman -S firejail       # Arch\n")
    process.exit(1)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const existing = cfg.sandbox?.allowedBinaries ?? []

  console.info("\nhuxflux sandbox setup\n")
  console.info("Repo paths are automatic — derived from repos registered in the web app.")
  console.info(`Built-in: git, node, claude, sh, bash, curl`)
  if (existing.length > 0) console.info(`Currently allowed extras: ${existing.join(", ")}`)
  console.info("")

  const binsInput = await prompt(rl, "Extra CLIs to allow (comma-separated, or Enter for none):\n> ")
  rl.close()

  const allowedBinaries = binsInput.split(",").map((b) => b.trim()).filter(Boolean)

  cfg.sandbox = { enabled: true, allowedBinaries }
  saveConfig(cfg)

  console.info("\nSandbox configured:")
  console.info(`  Extra binaries: ${allowedBinaries.length > 0 ? allowedBinaries.join(", ") : "none"}`)
  console.info(`\nRestart to apply: huxflux stop && huxflux start\n`)
}

// ── Commands ──────────────────────────────────────────────────────────────────

interface StartResult { pid: number; port: number; cfg: Config }

async function startServer(opts?: { silent?: boolean }): Promise<StartResult> {
  const existing = getRunningPid()
  if (existing) {
    const cfg = loadConfig()
    const port = getActualPort(cfg.port)
    if (!opts?.silent) {
      console.info(`huxflux is already running  (PID ${existing})`)
      console.info(`  Status: huxflux status`)
      console.info(`  Logs:   huxflux logs`)
    }
    return { pid: existing, port, cfg }
  }

  // If the service was unloaded (by `huxflux stop`), re-load it so it starts again
  if (isServiceInstalled()) {
    // Service plist/unit file exists but process isn't running, re-activate it
    const plat = os.platform()
    if (plat === "darwin") {
      spawnSync("launchctl", ["load", path.join(os.homedir(), "Library", "LaunchAgents", "com.huxflux.server.plist")], { stdio: "pipe" })
    } else if (plat === "linux") {
      spawnSync("systemctl", ["--user", "start", "huxflux"], { stdio: "pipe" })
    }
    // Wait for the service to write a PID file
    const cfg = loadConfig()
    const serviceDeadline = Date.now() + 5000
    while (!getRunningPid() && Date.now() < serviceDeadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
    }
    const pid = getRunningPid()
    if (pid) {
      const port = getActualPort(cfg.port)
      return { pid, port, cfg }
    }
    // Service didn't start in time, fall through to manual start
  }

  const cfg = loadConfig()

  if (!opts?.silent) {
    const isFirstStart = !cfg.disclaimerShown
    if (isFirstStart) {
      printDisclaimer()
      cfg.disclaimerShown = true
      saveConfig(cfg)
    }
  } else if (!cfg.disclaimerShown) {
    cfg.disclaimerShown = true
    saveConfig(cfg)
  }

  ensureDataDir()

  // Spawn the supervisor process which handles restart-on-crash
  const logFd = fs.openSync(LOG_FILE, "a")
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "_supervisor"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: serverEnv(cfg),
  })
  child.unref()
  fs.closeSync(logFd)

  if (!child.pid) {
    throw new Error("Failed to start server process")
  }

  fs.writeFileSync(PID_FILE, String(child.pid))

  // Wait for the server to bind and write its port file (up to 5s)
  const deadline = Date.now() + 5000
  while (!fs.existsSync(PORT_FILE) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }

  const port = getActualPort(cfg.port)
  return { pid: child.pid, port, cfg }
}

async function cmdStart() {
  const { pid, cfg } = await startServer()

  console.info(`\nhuxflux started\n`)
  await printConnectInfo(cfg, pid)
  console.info(`\n  huxflux logs    — tail the server log`)
  console.info(`  huxflux crashes — tail the crash log`)
  console.info(`  huxflux stop    — stop the server`)
  if (!cfg.sandbox?.enabled && os.platform() === "linux") {
    console.info(`\n  Tip: run 'huxflux sandbox' to restrict Claude's file access.`)
  }
  console.info("")
}

// ── Supervisor — restarts the server on crash ────────────────────────────────

function runSupervisor() {
  // Write our PID so `huxflux stop` can find us (covers both cmdStart and service launch)
  ensureDataDir()
  fs.writeFileSync(PID_FILE, String(process.pid))

  const MAX_RESTARTS = 5
  const RESTART_WINDOW_MS = 60_000
  const RESTART_DELAY_MS = 2_000
  const restartTimes: number[] = []
  function logCrash(code: number | null, signal: string | null) {
    const timestamp = new Date().toISOString()
    const reason = signal ? `signal ${signal}` : `exit code ${code}`
    const line = `[${timestamp}] Server crashed (${reason})\n`
    fs.appendFileSync(CRASH_LOG, line)
  }

  function startServer() {
    // Clean up stale port file so the new instance can bind
    if (fs.existsSync(PORT_FILE)) {
      try { fs.unlinkSync(PORT_FILE) } catch { /* ignore */ }
    }

    const child = spawn(process.execPath, [SERVER_ENTRY], {
      stdio: "inherit",
      env: process.env,
    })

    child.on("exit", (code, signal) => {
      // Clean exit (SIGTERM from `huxflux stop`, or code 0) — don't restart
      if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") {
        process.exit(0)
      }

      // Exit code 42 = planned restart after update (not a crash)
      if (code === 42) {
        console.info("[supervisor] Server updated, restarting with new version...")
        setTimeout(startServer, 1000)
        return
      }

      logCrash(code, signal)
      console.error(`[supervisor] Server crashed (${signal ?? `code ${code}`}), restarting...`)

      // Rate-limit restarts to avoid tight crash loops
      const now = Date.now()
      restartTimes.push(now)
      // Only keep restarts within the window
      while (restartTimes.length > 0 && restartTimes[0] < now - RESTART_WINDOW_MS) {
        restartTimes.shift()
      }

      if (restartTimes.length > MAX_RESTARTS) {
        const msg = `[${new Date().toISOString()}] Too many crashes (${MAX_RESTARTS} in ${RESTART_WINDOW_MS / 1000}s), giving up\n`
        fs.appendFileSync(CRASH_LOG, msg)
        console.error(`[supervisor] ${msg.trim()}`)
        process.exit(1)
      }

      setTimeout(startServer, RESTART_DELAY_MS)
    })

    // Forward SIGTERM/SIGINT to the child so `huxflux stop` works
    process.on("SIGTERM", () => { child.kill("SIGTERM") })
    process.on("SIGINT", () => { child.kill("SIGINT") })
  }

  startServer()
}

function isServiceInstalled(): boolean {
  const platform = os.platform()
  if (platform === "darwin") {
    return fs.existsSync(path.join(os.homedir(), "Library", "LaunchAgents", "com.huxflux.server.plist"))
  }
  if (platform === "linux") {
    return fs.existsSync(path.join(os.homedir(), ".config", "systemd", "user", "huxflux.service"))
  }
  return false
}

function cmdStop() {
  const pid = getRunningPid()
  if (!pid) {
    // Check if a service is installed but PID file is missing
    if (isServiceInstalled()) {
      console.info("Stopping via system service...")
      const plat = os.platform()
      if (plat === "darwin") {
        // Unload stops the process and prevents KeepAlive from restarting it
        spawnSync("launchctl", ["unload", path.join(os.homedir(), "Library", "LaunchAgents", "com.huxflux.server.plist")], { stdio: "pipe" })
      } else if (plat === "linux") {
        spawnSync("systemctl", ["--user", "stop", "huxflux"], { stdio: "pipe" })
      }
      if (fs.existsSync(PID_FILE)) try { fs.unlinkSync(PID_FILE) } catch { /* best-effort cleanup */ }
      if (fs.existsSync(PORT_FILE)) try { fs.unlinkSync(PORT_FILE) } catch { /* best-effort cleanup */ }
      console.info("huxflux stopped")
      console.info("Note: auto-start is now disabled. Run 'huxflux start' to restart, or re-run 'huxflux setup' to re-enable auto-start.")
      return
    }
    console.info("huxflux is not running")
    process.exit(0)
  }
  try { process.kill(pid, "SIGTERM") } catch { /* already gone */ }
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
  if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE)
  console.info(`huxflux stopped  (PID ${pid})`)
}

async function cmdStatus() {
  const pid = getRunningPid()
  const cfg = loadConfig()

  if (!pid) {
    console.info("huxflux  stopped\n")
    console.info("Run 'huxflux start' to start the server.")
    return
  }

  console.info(`huxflux  running  (PID ${pid})`)
  console.info(`  Version: ${VERSION}`)
  console.info(`  Node.js: ${process.versions.node}${nodeMajor > 24 ? " (unsupported, use Node 22 LTS)" : ""}`)
  console.info("")
  await printConnectInfo(cfg)
}

function cmdLogs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.info("No logs yet. Start the server first: huxflux start")
    process.exit(1)
  }
  const tail = spawn("tail", ["-f", "-n", "100", LOG_FILE], { stdio: "inherit" })
  tail.on("close", (code) => process.exit(code ?? 0))
  process.on("SIGINT", () => { tail.kill(); process.exit(0) })
}

function cmdCrashes() {
  if (!fs.existsSync(CRASH_LOG)) {
    console.info("No crashes recorded.")
    process.exit(0)
  }
  const tail = spawn("tail", ["-f", "-n", "50", CRASH_LOG], { stdio: "inherit" })
  tail.on("close", (code) => process.exit(code ?? 0))
  process.on("SIGINT", () => { tail.kill(); process.exit(0) })
}

function cmdAudit() {
  const auditLog = path.join(DATA_DIR, "audit.log")
  if (!fs.existsSync(auditLog)) {
    console.info("No audit log yet. Start the server first: huxflux start")
    process.exit(1)
  }
  const tail = spawn("tail", ["-f", "-n", "50", auditLog], { stdio: "inherit" })
  tail.on("close", (code) => process.exit(code ?? 0))
  process.on("SIGINT", () => { tail.kill(); process.exit(0) })
}

function cmdToken(sub?: string) {
  const cfg = loadConfig()
  if (sub === "rotate") {
    cfg.token = crypto.randomBytes(32).toString("hex")
    saveConfig(cfg)
    console.info(`\nNew token generated.\n`)
    console.info(`  Update the web app with the new connection string:`)
    console.info(`\n    ${connectionString(cfg)}\n`)
    console.info(`  Restart to apply: huxflux stop && huxflux start\n`)
    return
  }
  console.info(cfg.token)
}

function cmdRestore(slot?: string) {
  const pid = getRunningPid()
  if (pid) {
    console.error("huxflux is running — stop it first: huxflux stop")
    process.exit(1)
  }

  // Pick backup slot
  const src = slot === "2" ? DB_BAK2 : DB_BAK
  const slotLabel = slot === "2" ? ".bak2 (older)" : ".bak (latest)"

  if (!fs.existsSync(src)) {
    console.error(`No backup found at ${src}`)
    process.exit(1)
  }

  const backupStat = fs.statSync(src)
  const age = Math.round((Date.now() - backupStat.mtimeMs) / 1000 / 60)
  const ageLabel = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`

  console.info(`\nRestore from ${slotLabel}`)
  console.info(`  Source:  ${src}`)
  console.info(`  Created: ${backupStat.mtime.toISOString()}  (${ageLabel})`)
  if (fs.existsSync(DB_FILE)) {
    const dbStat = fs.statSync(DB_FILE)
    console.info(`  Current: ${DB_FILE}  (${Math.round((Date.now() - dbStat.mtimeMs) / 1000 / 60)}m old)`)
  }
  console.info("")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question("Replace current database with this backup? [y/N] ", (answer) => {
    rl.close()
    if (answer.toLowerCase() !== "y") {
      console.info("Aborted.")
      process.exit(0)
    }

    // Save the current DB as a pre-restore snapshot before overwriting
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, DB_FILE + ".pre-restore")
      console.info(`  Saved current DB → ${DB_FILE}.pre-restore`)
    }

    fs.copyFileSync(src, DB_FILE)
    console.info(`  Restored ${src} → ${DB_FILE}`)
    console.info("\nDone. Run 'huxflux start' to restart.\n")
  })
}

async function cmdReset() {
  const pid = getRunningPid()
  if (pid) {
    console.error("huxflux is running — stop it first: huxflux stop")
    process.exit(1)
  }

  console.info(`
  ┌─ WARNING: DESTRUCTIVE OPERATION ──────────────────────────────┐
  │                                                               │
  │  This will PERMANENTLY DELETE your entire database:           │
  │                                                               │
  │    • All agents and their conversation history                │
  │    • All repositories                                         │
  │    • All messages, tool calls, and file changes               │
  │    • All terminal history                                      │
  │    • All database backups (.bak, .bak2)                       │
  │    • All git worktrees in <WORKSPACES_BASE>                   │
  │                                                               │
  │  Note: git repos themselves are untouched, but you may need   │
  │  to run 'git worktree prune' in each repo afterward.          │
  │                                                               │
  │  This action CANNOT be undone.                                │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘
  Data directory: ${DATA_DIR}
`.trimStart())

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const a1 = await prompt(rl, "  Confirmation 1/3 — Do you want to erase all data? [y/N] ")
  if (a1.toLowerCase() !== "y") { rl.close(); console.info("\n  Aborted.\n"); process.exit(0) }

  const a2 = await prompt(rl, "  Confirmation 2/3 — Type \"yes\" to continue: ")
  if (a2 !== "yes") { rl.close(); console.info("\n  Aborted.\n"); process.exit(0) }

  const a3 = await prompt(rl, "  Confirmation 3/3 — Type \"huxflux\" to confirm the reset: ")
  rl.close()
  if (a3 !== "huxflux") { console.info("\n  Aborted.\n"); process.exit(0) }

  console.info("")
  for (const f of [DB_FILE, DB_BAK, DB_BAK2]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f)
      console.info(`  Deleted ${f}`)
    }
  }
  if (fs.existsSync(WORKSPACES)) {
    fs.rmSync(WORKSPACES, { recursive: true, force: true })
    console.info(`  Deleted ${WORKSPACES}`)
  }
  console.info("\n  Reset complete. Run 'huxflux start' for a fresh instance.")
  console.info("  Tip: run 'git worktree prune' in each repo to remove stale refs.\n")
}

const WEB_APP_FALLBACK = "https://huxflux.netlify.app"

function cmdOpen(host?: string) {
  const cfg = loadConfig()
  const pid = getRunningPid()
  if (!pid) {
    console.info("huxflux is not running — start it first: huxflux start")
    process.exit(1)
  }
  const port = getActualPort(cfg.port)

  // Use local web UI if bundled, otherwise fall back to hosted app
  const webDistPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "web", "index.html")
  let url: string
  if (fs.existsSync(webDistPath)) {
    url = `http://127.0.0.1:${port}`
    console.info(`Opening http://127.0.0.1:${port}`)
  } else {
    const conn = connectionString(cfg, host ?? "localhost")
    url = `${WEB_APP_FALLBACK}/?connect=${encodeURIComponent(conn)}`
    console.info(`Opening ${WEB_APP_FALLBACK}`)
  }
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  spawnSync(opener, [url], { stdio: "inherit", shell: true })
}

function getUpdateChannel(): string {
  const settingsFile = path.join(DATA_DIR, "settings.json")
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
    if (settings.updateChannel === "beta") return "beta"
  } catch { /* missing or malformed */ }
  return "latest"
}

function ensureNpmRegistry() {
  const npmrc = path.join(os.homedir(), ".npmrc")
  try {
    const content = fs.existsSync(npmrc) ? fs.readFileSync(npmrc, "utf8") : ""
    if (!content.includes("@minuthq:registry=https://npm.pkg.github.com")) {
      fs.appendFileSync(npmrc, "\n@minuthq:registry=https://npm.pkg.github.com\n")
    }
  } catch { /* best-effort */ }
}

function cmdUpdate() {
  ensureNpmRegistry()
  const tag = getUpdateChannel()
  const label = tag === "beta" ? " (beta channel)" : ""
  console.info(`\nUpdating huxflux${label} (current: ${VERSION})...\n`)
  let result = spawnSync(`npm install -g @minuthq/huxflux@${tag}`, [], { stdio: "inherit", shell: true })
  if (result.status !== 0) {
    console.info("\nRetrying with sudo...")
    result = spawnSync(`sudo npm install -g @minuthq/huxflux@${tag}`, [], { stdio: "inherit", shell: true })
  }
  if (result.status !== 0) {
    console.error("\nUpdate failed. Run manually:")
    console.error(`  npm install -g @minuthq/huxflux@${tag}`)
    console.error(`  # or: sudo npm install -g @minuthq/huxflux@${tag}\n`)
    process.exit(result.status ?? 1)
  }
  console.info(`\nUpdate complete. Restart to apply: huxflux stop && huxflux start\n`)
}

function cmdRun() {
  const cfg = loadConfig()
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: "inherit",
    env: serverEnv(cfg),
  })
  child.on("close", (code) => process.exit(code ?? 0))
}

// ── Setup wizard ─────────────────────────────────────────────────────────────

async function cmdSetup() {
  const p = await import("@clack/prompts")

  console.info("")
  p.intro("Huxflux Setup")

  // ── Detect environment ──
  const serverRunning = getRunningPid() !== null
  const connectionFile = path.join(DATA_DIR, "connection.json")
  const dbExists = fs.existsSync(path.join(DATA_DIR, "huxflux.db"))
  const platform = os.platform()
  const arch = os.arch()

  // Headless detection: SSH, Docker, no display, or CI
  const isHeadless = !!(
    process.env.SSH_CONNECTION ||
    process.env.SSH_TTY ||
    fs.existsSync("/.dockerenv") ||
    process.env.container === "docker" ||
    process.env.CI ||
    (platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
  )

  const desktopPaths = [
    "/Applications/Huxflux.app",
    path.join(os.homedir(), "Applications", "Huxflux.app"),
    path.join(os.homedir(), ".local", "bin", "Huxflux.AppImage"),
  ]
  const hasDesktop = !isHeadless && desktopPaths.some(dp => fs.existsSync(dp))
  const canInstallDesktop = !isHeadless && (platform === "darwin" || platform === "linux")

  const platformLabel = platform === "darwin" ? `macOS ${arch === "arm64" ? "Apple Silicon" : "Intel"}`
    : platform === "linux" ? "Linux x86_64" : platform === "win32" ? "Windows" : platform
  const envLabel = isHeadless
    ? (process.env.SSH_CONNECTION ? "Remote (SSH)" : fs.existsSync("/.dockerenv") ? "Docker" : "Headless")
    : "Local"

  p.log.info(`Platform:    ${platformLabel}`)
  p.log.info(`Environment: ${envLabel}`)
  p.log.info(`Data:        ${DATA_DIR}`)

  if (serverRunning) p.log.success("Server:      running")
  else if (dbExists)  p.log.info("Server:      stopped")
  else                p.log.info("Server:      not installed")

  if (isHeadless) {
    p.log.info("Desktop:     n/a (headless)")
  } else if (hasDesktop) {
    p.log.success("Desktop:     installed")
  } else {
    p.log.info("Desktop:     not installed")
  }

  // ── Already set up ──
  if (serverRunning && (hasDesktop || isHeadless)) {
    const conn = fs.existsSync(connectionFile)
      ? JSON.parse(fs.readFileSync(connectionFile, "utf-8"))
      : null

    p.log.success("Everything is already set up!")
    if (conn) {
      p.log.info(`Server: ${conn.url}`)
      if (isHeadless) {
        const connStr = connectionString(loadConfig())
        p.log.message(`\n  Connect from another device:\n\n    ${connStr}\n`)
        try {
          const qr = await qrToString(connStr, { type: "terminal", small: true })
          console.info(qr)
        } catch { /* QR generation is best-effort */ }
      }
    }
    p.outro("Run 'huxflux status' for details, or 'huxflux update' to check for updates.")
    return
  }

  // ── Component selection ──
  const options: { value: string; label: string; hint: string }[] = []
  if (!serverRunning) {
    options.push({
      value: "server",
      label: "Server",
      hint: dbExists ? "restart" : "API, database, and web UI",
    })
  }
  if (canInstallDesktop && !hasDesktop) {
    options.push({ value: "desktop", label: "Desktop app", hint: platformLabel })
  }

  if (options.length === 0) {
    p.outro("Nothing to install. Run 'huxflux status' for server details.")
    return
  }

  const components = await p.multiselect({
    message: "What would you like to install?",
    options,
    initialValues: options.map(o => o.value),
    required: false,
  })

  if (p.isCancel(components)) {
    p.cancel("Setup cancelled.")
    process.exit(0)
  }

  const selected = components as string[]

  // ── Server setup ──
  if (selected.includes("server")) {
    // Ask about auto-start first, before starting anything
    const canService = platform === "darwin" || platform === "linux"
    let wantsService = false
    if (canService) {
      const installService = await p.confirm({ message: "Start automatically on login? (you can always run 'huxflux start' manually)" })
      if (p.isCancel(installService)) { p.cancel("Setup cancelled."); process.exit(0) }
      wantsService = !!installService
    }

    const s = p.spinner()

    if (wantsService) {
      // Install service, which starts the server via the supervisor
      s.start("Installing service and starting server...")
      try {
        installSystemService()
      } catch (err) {
        s.stop("Could not install service")
        p.log.warning((err as Error).message)
        p.log.info("Starting manually instead...")
        try {
          await startServer({ silent: true })
        } catch (startErr) {
          p.log.error((startErr as Error).message || "Failed to start server")
        }
      }
    } else {
      s.start("Starting server...")
      try {
        await startServer({ silent: true })
      } catch (err) {
        s.stop("Failed to start server")
        p.log.error((err as Error).message || "Unknown error")
      }
    }

    // Wait for connection.json (server writes it once it binds a port)
    for (let i = 0; i < 30; i++) {
      if (fs.existsSync(connectionFile)) break
      await new Promise(r => setTimeout(r, 500))
    }

    if (fs.existsSync(connectionFile)) {
      const conn = JSON.parse(fs.readFileSync(connectionFile, "utf-8"))
      s.stop("Server is running")
      p.log.success(`${conn.url}`)
      if (wantsService) {
        p.log.info("Auto-start on login enabled")
      }
    } else {
      s.stop("Server started")
      p.log.info("Run 'huxflux logs' if something looks off")
    }

    // On headless: show connection string + QR for remote access
    if (isHeadless) {
      const cfg = loadConfig()
      const connStr = connectionString(cfg, getOutboundIp())
      p.log.step("Connect from another device:")
      p.log.message(`\n    ${connStr}\n`)
      try {
        const qr = await qrToString(connStr, { type: "terminal", small: true })
        console.info(qr)
      } catch { /* QR generation is best-effort */ }
    }
  }

  // ── Install desktop (only on local machines with a display) ──
  if (selected.includes("desktop")) {
    const s = p.spinner()
    s.start("Fetching latest desktop release...")

    try {
      const channel = getUpdateChannel()
      const releaseUrl = channel === "beta"
        ? "https://api.github.com/repos/MinutHQ/huxflux/releases?per_page=5"
        : "https://github.com/MinutHQ/huxflux/releases/latest/download/latest.json"

      let release: { version: string; platforms: Record<string, { url: string }> }
      if (channel === "beta") {
        const releasesRes = await fetch(releaseUrl, { headers: { Accept: "application/vnd.github+json" } })
        const releases = await releasesRes.json() as Array<{ prerelease: boolean; tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }>
        const betaRelease = releases.find(r => r.prerelease)
        if (!betaRelease) throw new Error("No beta release found")
        const manifestAsset = betaRelease.assets.find(a => a.name === "latest-beta.json")
        if (!manifestAsset) throw new Error("No updater manifest in beta release")
        const manifestRes = await fetch(manifestAsset.browser_download_url)
        release = await manifestRes.json() as typeof release
      } else {
        const res = await fetch(releaseUrl)
        release = await res.json() as typeof release
      }

      const platformKey = platform === "darwin"
        ? (arch === "arm64" ? "darwin-aarch64" : "darwin-x86_64")
        : platform === "linux" ? "linux-x86_64" : null

      // Use stable DMG/AppImage/deb URLs for fresh install (not the updater tarballs)
      const tag = `v${release.version}`
      const baseUrl = `https://github.com/MinutHQ/huxflux/releases/download/${tag}`
      const installUrls: Record<string, string> = {
        "darwin-aarch64": `${baseUrl}/Huxflux-macos-arm.dmg`,
        "darwin-x86_64": `${baseUrl}/Huxflux-macos-intel.dmg`,
        "linux-x86_64": `${baseUrl}/Huxflux-linux-x86_64.AppImage`,
      }

      if (platformKey && (release.platforms[platformKey] || installUrls[platformKey])) {
        const downloadUrl = installUrls[platformKey] ?? release.platforms[platformKey].url
        s.stop(`Found desktop v${release.version}`)

        if (platform === "darwin") {
          const installDesktop = await p.confirm({ message: `Install Huxflux Desktop v${release.version}?` })
          if (!p.isCancel(installDesktop) && installDesktop) {
            const ds = p.spinner()
            ds.start("Downloading...")

            try {
              const tmpDir = path.join(os.tmpdir(), `huxflux-desktop-${Date.now()}`)
              fs.mkdirSync(tmpDir, { recursive: true })
              const dmgPath = path.join(tmpDir, "Huxflux.dmg")

              const dlRes = await fetch(downloadUrl, { redirect: "follow" })
              if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`)
              const buffer = Buffer.from(await dlRes.arrayBuffer())
              if (buffer.length < 1000) throw new Error(`Download too small (${buffer.length} bytes), likely not a valid file`)
              fs.writeFileSync(dmgPath, buffer)

              // Remove quarantine from downloaded DMG so hdiutil can mount it
              spawnSync("xattr", ["-rd", "com.apple.quarantine", dmgPath], { stdio: "pipe" })

              // Detach any stale Huxflux volumes from previous attempts
              try {
                const volumes = fs.readdirSync("/Volumes").filter(v => v.startsWith("Huxflux"))
                for (const v of volumes) spawnSync("hdiutil", ["detach", `/Volumes/${v}`, "-quiet", "-force"], { stdio: "pipe" })
              } catch { /* best-effort detach */ }

              const mountResult = spawnSync("hdiutil", ["attach", dmgPath, "-nobrowse", "-quiet"], { encoding: "utf-8", stdio: "pipe" })
              const mountLine = (mountResult.stdout || "").split("\n").find((l: string) => l.includes("/Volumes/"))
              const mountPoint = mountLine?.trim().split("\t").pop()?.trim()

              if (mountPoint) {
                const appName = fs.readdirSync(mountPoint).find(f => f.endsWith(".app"))
                if (appName) {
                  const dest = `/Applications/${appName}`
                  if (fs.existsSync(dest)) spawnSync("rm", ["-rf", dest], { stdio: "pipe" })
                  spawnSync("cp", ["-R", path.join(mountPoint, appName), dest], { stdio: "pipe" })
                  spawnSync("hdiutil", ["detach", mountPoint, "-quiet"], { stdio: "pipe" })
                  // Remove quarantine flag (app is unsigned, macOS blocks downloaded apps)
                  spawnSync("xattr", ["-rd", "com.apple.quarantine", dest], { stdio: "pipe" })
                  ds.stop("Desktop installed")
                  p.log.success(`Installed to /Applications/${appName}`)

                  const openApp = await p.confirm({ message: "Open it now?" })
                  if (!p.isCancel(openApp) && openApp) {
                    spawnSync("open", [dest], { stdio: "pipe" })
                    p.log.success("Launched — it will connect to your local server automatically")
                  }
                } else {
                  spawnSync("hdiutil", ["detach", mountPoint, "-quiet"], { stdio: "pipe" })
                  ds.stop("Install failed")
                  p.log.warning("Could not find .app in DMG")
                }
              } else {
                ds.stop("Mount failed")
                const mountErr = (mountResult.stderr || "").trim()
                p.log.warning(`Could not mount DMG${mountErr ? `: ${mountErr}` : ""}`)
                p.log.info(`DMG path: ${dmgPath}`)
                p.log.info("Try manually: hdiutil attach " + dmgPath)
              }

              try { fs.rmSync(tmpDir, { recursive: true }) } catch { /* tmp cleanup is best-effort */ }
            } catch (dlErr) {
              ds.stop("Download failed")
              p.log.error((dlErr as Error).message)
              p.log.info(`Download manually: ${downloadUrl}`)
            }
          }
        } else if (platform === "linux") {
          const installDesktop = await p.confirm({ message: `Install Huxflux Desktop v${release.version}?` })
          if (!p.isCancel(installDesktop) && installDesktop) {
            const ds = p.spinner()
            ds.start("Downloading...")

            try {
              const tmpDir = path.join(os.tmpdir(), `huxflux-desktop-${Date.now()}`)
              fs.mkdirSync(tmpDir, { recursive: true })
              const appImagePath = path.join(tmpDir, "Huxflux.AppImage")

              const dlRes = await fetch(downloadUrl)
              const buffer = Buffer.from(await dlRes.arrayBuffer())
              fs.writeFileSync(appImagePath, buffer)

              // Install to ~/.local/bin (user-writable, usually on PATH)
              const localBin = path.join(os.homedir(), ".local", "bin")
              fs.mkdirSync(localBin, { recursive: true })
              const dest = path.join(localBin, "Huxflux.AppImage")
              fs.copyFileSync(appImagePath, dest)
              fs.chmodSync(dest, 0o755)
              ds.stop("Desktop installed")
              p.log.success(`Installed to ${dest}`)

              // Create a .desktop entry for app launchers
              const desktopDir = path.join(os.homedir(), ".local", "share", "applications")
              fs.mkdirSync(desktopDir, { recursive: true })
              const desktopEntry = `[Desktop Entry]
Name=Huxflux
Exec=${dest}
Type=Application
Categories=Development;
Comment=AI Agent Orchestrator
Terminal=false
`
              fs.writeFileSync(path.join(desktopDir, "huxflux.desktop"), desktopEntry)
              p.log.info("Desktop entry created for app launchers")

              const openApp = await p.confirm({ message: "Open it now?" })
              if (!p.isCancel(openApp) && openApp) {
                spawn(dest, [], { detached: true, stdio: "ignore" }).unref()
                p.log.success("Launched — it will connect to your local server automatically")
              }

              try { fs.rmSync(tmpDir, { recursive: true }) } catch { /* tmp cleanup is best-effort */ }
            } catch (dlErr) {
              ds.stop("Download failed")
              p.log.error((dlErr as Error).message)
              p.log.info(`Download manually: ${downloadUrl}`)
            }
          }
        } else {
          p.log.info(`Download: ${downloadUrl}`)
          p.log.info("The desktop app will auto-connect to your local server.")
        }
      } else {
        s.stop("No desktop build for this platform")
        p.log.info("Use the web UI instead: open the server URL in your browser")
      }
    } catch {
      s.stop("Could not fetch release info")
      p.log.error("Check: https://github.com/MinutHQ/huxflux/releases")
    }
  }

  // ── Summary ──
  console.info("")
  p.log.warning("The auth token grants shell access to this machine. Treat it like an SSH key.")
  p.log.info("Run 'huxflux security' for details.")
  console.info("")
  p.log.step("Useful commands:")
  p.log.info("huxflux status   Connection info and server URL")
  p.log.info("huxflux logs     Tail the server log")
  p.log.info("huxflux stop     Stop the server")
  p.log.info("huxflux update   Update to the latest version")

  // Build a helpful outro based on what was installed
  const hasServer = selected.includes("server")
  const installedDesktop = selected.includes("desktop")
  if (hasServer && !installedDesktop) {
    const cfg = loadConfig()
    const port = getActualPort(cfg.port)
    p.outro(`You're all set! Open http://127.0.0.1:${port} in your browser to get started.`)
  } else if (installedDesktop) {
    p.outro("You're all set! Open the desktop app to get started.")
  } else {
    p.outro("You're all set!")
  }
}

// ── Data management ──────────────────────────────────────────────────────────

async function cmdData(action?: string, direction?: string) {
  const p = await import("@clack/prompts")

  const prodDb = path.join(DATA_DIR, "huxflux.db")
  const devDb = path.join(DATA_DIR, "huxflux-dev.db")

  if (action === "copy") {
    if (direction === "dev-to-prod") {
      if (!fs.existsSync(devDb)) {
        console.error("Dev database not found:", devDb)
        process.exit(1)
      }

      p.intro("Copy dev data to production")
      p.log.warning("This will REPLACE your production database with dev data!")

      const confirm1 = await p.confirm({ message: "Are you sure? This is destructive." })
      if (p.isCancel(confirm1) || !confirm1) { p.cancel("Cancelled"); process.exit(0) }

      const confirm2 = await p.confirm({ message: "All production data will be lost. Continue?" })
      if (p.isCancel(confirm2) || !confirm2) { p.cancel("Cancelled"); process.exit(0) }

      const confirm3 = await p.confirm({ message: "Final confirmation. Type Y to proceed." })
      if (p.isCancel(confirm3) || !confirm3) { p.cancel("Cancelled"); process.exit(0) }

      // Stop server if running
      const pid = getRunningPid()
      if (pid) {
        p.log.info("Stopping server first...")
        process.kill(pid, "SIGTERM")
        await new Promise(r => setTimeout(r, 2000))
      }

      // Backup current prod
      if (fs.existsSync(prodDb)) {
        const backup = prodDb + ".pre-copy-bak"
        fs.copyFileSync(prodDb, backup)
        p.log.info(`Backed up production DB to ${backup}`)
      }

      // Copy
      fs.copyFileSync(devDb, prodDb)
      p.log.success("Dev data copied to production")
      p.outro("Done. Start the server with 'huxflux start' — migrations will run automatically.")

    } else if (direction === "prod-to-dev") {
      if (!fs.existsSync(prodDb)) {
        console.error("Production database not found:", prodDb)
        process.exit(1)
      }

      p.intro("Copy production data to dev")

      const confirm = await p.confirm({ message: "This will replace your dev database. Continue?" })
      if (p.isCancel(confirm) || !confirm) { p.cancel("Cancelled"); process.exit(0) }

      if (fs.existsSync(devDb)) {
        const backup = devDb + ".pre-copy-bak"
        fs.copyFileSync(devDb, backup)
        p.log.info(`Backed up dev DB to ${backup}`)
      }

      fs.copyFileSync(prodDb, devDb)
      p.log.success("Production data copied to dev")
      p.outro("Done. Run 'pnpm dev' to start with the copied data.")

    } else {
      console.error("Usage: huxflux data copy [dev-to-prod|prod-to-dev]")
      process.exit(1)
    }
  } else {
    console.info(`
huxflux data — Manage databases

Usage:
  huxflux data copy dev-to-prod    Copy dev database to production (destructive, 3 confirmations)
  huxflux data copy prod-to-dev    Copy production database to dev
`)
  }
}

// ── System service ───────────────────────────────────────────────────────────

function installSystemService() {
  const platform = os.platform()
  const cfg = loadConfig()
  const cliEntry = fileURLToPath(import.meta.url)

  // Find the huxflux binary path (works across nvm switches)
  const huxfluxBin = spawnSync("which", ["huxflux"], { encoding: "utf-8", stdio: "pipe" }).stdout.trim()
    || path.join(path.dirname(process.execPath), "huxflux")

  // Build a PATH that includes nvm shims, homebrew, and standard dirs
  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), ".nvm")
  const currentNodeBin = path.dirname(process.execPath)
  const servicePath = [
    currentNodeBin,
    `${nvmDir}/current/bin`,
    `${os.homedir()}/.local/bin`,
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":")

  if (platform === "darwin") {
    // macOS: LaunchAgent (runs as current user, starts on login)
    // Uses a shell wrapper so it picks up the current nvm Node version
    const plistDir = path.join(os.homedir(), "Library", "LaunchAgents")
    fs.mkdirSync(plistDir, { recursive: true })

    // Write a launcher script that sources nvm before running huxflux
    const launcherPath = path.join(DATA_DIR, "launch-service.sh")
    const launcherContent = [
      `#!/bin/bash`,
      `export NVM_DIR="${nvmDir}"`,
      `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`,
      `export NODE_ENV=production`,
      `export AUTH_TOKEN="${cfg.token}"`,
      `export PORT="${cfg.port}"`,
      `export HUXFLUX_DIR="${DATA_DIR}"`,
      `export DB_PATH="${path.join(DATA_DIR, "huxflux.db")}"`,
      `export WORKSPACES_BASE="${path.join(DATA_DIR, "workspaces")}"`,
      `exec "${huxfluxBin}" _supervisor`,
    ].join("\n")
    fs.writeFileSync(launcherPath, launcherContent, { mode: 0o755 })

    const plistPath = path.join(plistDir, "com.huxflux.server.plist")
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.huxflux.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${launcherPath}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${servicePath}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(DATA_DIR, "server.log")}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(DATA_DIR, "server.log")}</string>
</dict>
</plist>`
    fs.writeFileSync(plistPath, plist)
    spawnSync("launchctl", ["load", plistPath], { stdio: "pipe" })

  } else if (platform === "linux") {
    // Linux: systemd user service running the supervisor via shell wrapper
    const serviceDir = path.join(os.homedir(), ".config", "systemd", "user")
    fs.mkdirSync(serviceDir, { recursive: true })

    // Write launcher script that sources nvm
    const launcherPath = path.join(DATA_DIR, "launch-service.sh")
    const launcherContent = [
      `#!/bin/bash`,
      `export NVM_DIR="${nvmDir}"`,
      `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`,
      `export NODE_ENV=production`,
      `export AUTH_TOKEN="${cfg.token}"`,
      `export PORT="${cfg.port}"`,
      `export HUXFLUX_DIR="${DATA_DIR}"`,
      `export DB_PATH="${path.join(DATA_DIR, "huxflux.db")}"`,
      `export WORKSPACES_BASE="${path.join(DATA_DIR, "workspaces")}"`,
      `exec "${huxfluxBin}" _supervisor`,
    ].join("\n")
    fs.writeFileSync(launcherPath, launcherContent, { mode: 0o755 })

    const systemdServicePath = path.join(serviceDir, "huxflux.service")
    const service = `[Unit]
Description=Huxflux Server
After=network.target

[Service]
Type=simple
ExecStart=${launcherPath}
Environment=PATH=${servicePath}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`
    fs.writeFileSync(systemdServicePath, service)
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "pipe" })
    spawnSync("systemctl", ["--user", "enable", "huxflux"], { stdio: "pipe" })
    spawnSync("systemctl", ["--user", "start", "huxflux"], { stdio: "pipe" })
    // Enable lingering so service runs even when user is not logged in
    spawnSync("loginctl", ["enable-linger", os.userInfo().username], { stdio: "pipe" })
  } else {
    throw new Error(`System services not supported on ${platform}`)
  }
}

function removeSystemService() {
  const platform = os.platform()

  if (platform === "darwin") {
    const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "com.huxflux.server.plist")
    if (fs.existsSync(plistPath)) {
      spawnSync("launchctl", ["unload", plistPath], { stdio: "pipe" })
      fs.unlinkSync(plistPath)
    }
  } else if (platform === "linux") {
    spawnSync("systemctl", ["--user", "stop", "huxflux"], { stdio: "pipe" })
    spawnSync("systemctl", ["--user", "disable", "huxflux"], { stdio: "pipe" })
    const servicePath = path.join(os.homedir(), ".config", "systemd", "user", "huxflux.service")
    if (fs.existsSync(servicePath)) fs.unlinkSync(servicePath)
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "pipe" })
  }
}

// ── Uninstall ────────────────────────────────────────────────────────────────

async function cmdUninstall() {
  const p = await import("@clack/prompts")

  console.info("")
  p.intro("Uninstall Huxflux")

  // Detect what's installed
  const pid = getRunningPid()
  const desktopPaths = [
    "/Applications/Huxflux.app",
    path.join(os.homedir(), "Applications", "Huxflux.app"),
    path.join(os.homedir(), ".local", "bin", "Huxflux.AppImage"),
  ]
  const desktopPath = desktopPaths.find(dp => fs.existsSync(dp))
  const dataExists = fs.existsSync(DATA_DIR)

  p.log.step("This will remove:")
  if (pid) p.log.info("Stop the running server")
  if (desktopPath) p.log.info(`Delete desktop app (${desktopPath})`)
  if (dataExists) p.log.info(`Delete all data (${DATA_DIR})`)
  p.log.info("Uninstall the npm package")

  const confirm1 = await p.confirm({ message: "Are you sure you want to uninstall Huxflux?" })
  if (p.isCancel(confirm1) || !confirm1) {
    p.cancel("Uninstall cancelled.")
    process.exit(0)
  }

  let keepData = false
  if (dataExists) {
    const keep = await p.confirm({ message: "Keep your data (database, workspaces, config)?" })
    if (!p.isCancel(keep)) keepData = !!keep
  }

  const confirm2 = await p.confirm({ message: keepData ? "Proceed with uninstall (keeping data)?" : "⚠ This will DELETE all your data. Proceed?" })
  if (p.isCancel(confirm2) || !confirm2) {
    p.cancel("Uninstall cancelled.")
    process.exit(0)
  }

  // Remove system service
  const s0 = p.spinner()
  s0.start("Removing system service...")
  try { removeSystemService() } catch { /* not installed */ }
  s0.stop("System service removed ✓")

  // Stop server
  if (pid) {
    const s = p.spinner()
    s.start("Stopping server...")
    try { process.kill(pid, "SIGTERM") } catch { /* already gone */ }
    await new Promise(r => setTimeout(r, 2000))
    try { fs.unlinkSync(path.join(DATA_DIR, "server.pid")) } catch { /* already removed */ }
    try { fs.unlinkSync(path.join(DATA_DIR, "server.port")) } catch { /* already removed */ }
    try { fs.unlinkSync(path.join(DATA_DIR, "connection.json")) } catch { /* already removed */ }
    s.stop("Server stopped ✓")
  }

  // Remove desktop app
  if (desktopPath) {
    const s = p.spinner()
    s.start("Removing desktop app...")
    spawnSync("rm", ["-rf", desktopPath], { stdio: "pipe" })
    s.stop("Desktop app removed ✓")
  }

  // Remove data
  if (dataExists && !keepData) {
    const s = p.spinner()
    s.start("Removing data...")
    fs.rmSync(DATA_DIR, { recursive: true, force: true })
    s.stop("Data removed ✓")
  }

  // Uninstall npm package
  p.log.step("To complete the uninstall, run:")
  p.log.message("\n    npm uninstall -g @minuthq/huxflux\n")
  p.outro("Huxflux has been uninstalled.")
}

// ── Config ──────────────────────────────────────────────────────────────────

function cmdConfig(key?: string, value?: string) {
  const settingsFile = path.join(DATA_DIR, "settings.json")
  let settings: Record<string, unknown> = {}
  try { settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")) } catch { /* file missing or malformed */ }

  if (key === "auto-update") {
    if (value === undefined) {
      console.info(`auto-update server: ${settings.autoUpdateServer ? "on" : "off"}`)
      return
    }

    if (value === "on" || value === "true") {
      settings.autoUpdateServer = true
    } else if (value === "off" || value === "false") {
      settings.autoUpdateServer = false
    } else {
      console.error(`Invalid value: ${value}. Use 'on' or 'off'.`)
      process.exit(1)
    }

    ensureDataDir()
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
    console.info(`auto-update server: ${settings.autoUpdateServer ? "on" : "off"}`)
    return
  }

  if (key === "channel") {
    if (value === undefined) {
      console.info(`update channel: ${settings.updateChannel === "beta" ? "beta" : "stable"}`)
      return
    }

    if (value === "stable" || value === "beta") {
      settings.updateChannel = value
    } else {
      console.error(`Invalid value: ${value}. Use 'stable' or 'beta'.`)
      process.exit(1)
    }

    ensureDataDir()
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
    console.info(`update channel: ${value}`)
    return
  }

  // No key or unknown key: show all config
  console.info(`
huxflux config — View and modify settings

Usage:
  huxflux config channel              Show update channel (stable or beta)
  huxflux config channel stable|beta  Switch update channel
  huxflux config auto-update          Show auto-update status
  huxflux config auto-update on|off   Enable/disable server auto-updates
`)
}

// ── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.info(`
huxflux — Huxflux server

Usage:
  huxflux [start]   Start the server in the background (auto-restarts on crash)
  huxflux setup     Interactive setup wizard (install components, start server)
  huxflux open [host]   Open the web app and auto-connect to this server
  huxflux stop      Stop the running server
  huxflux status    Show server status, URL, and auth token
  huxflux logs      Tail the server log (Ctrl+C to exit)
  huxflux crashes   Tail the crash log
  huxflux run       Run in the foreground (process managers / debug)
  huxflux sandbox [add|remove|enable|disable|setup]   Manage sandboxing
  huxflux security  Show security recommendations
  huxflux token          Print the auth token
  huxflux token rotate   Rotate to a new auth token
  huxflux audit          Tail the request audit log
  huxflux restore        Restore DB from latest backup (server must be stopped)
  huxflux restore 2      Restore DB from older backup (.bak2)
  huxflux reset          ⚠️  Erase all data and start fresh (3 confirmations required)
  huxflux update         Update huxflux to the latest version
  huxflux config channel [stable|beta]  View or switch update channel
  huxflux config auto-update [on|off]   View or set server auto-update
  huxflux data copy dev-to-prod    Copy dev database to production
  huxflux data copy prod-to-dev    Copy production database to dev
  huxflux uninstall      Remove Huxflux (server, desktop, data)
  huxflux help           Show this message

Environment variables:
  HUXFLUX_DIR   Data directory (default: ~/huxflux). Set to a different path to
                run multiple independent instances on the same machine.
                All other paths (DB, workspaces, logs, config) are derived from this.
  PORT          Override the server port (default: 4321)
`.trimStart())
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const [,, cmd = "start", ...cmdArgs] = process.argv

switch (cmd) {
  case "start":       cmdStart().catch(console.error); break
  case "_supervisor": runSupervisor(); break
  case "open":        cmdOpen(cmdArgs[0]); break
  case "stop":        cmdStop(); break
  case "status":      cmdStatus().catch(console.error); break
  case "logs":        cmdLogs(); break
  case "crashes":     cmdCrashes(); break
  case "run":         cmdRun(); break
  case "token":    cmdToken(cmdArgs[0]); break
  case "audit":    cmdAudit(); break
  case "restore":  cmdRestore(cmdArgs[0]); break
  case "reset":    cmdReset().catch(console.error); break
  case "update":   cmdUpdate(); break
  case "setup":    cmdSetup().catch(console.error); break
  case "config":    cmdConfig(cmdArgs[0], cmdArgs[1]); break
  case "data":      cmdData(cmdArgs[0], cmdArgs[1]).catch(console.error); break
  case "uninstall": cmdUninstall().catch(console.error); break
  case "sandbox":  cmdSandbox(cmdArgs[0], ...cmdArgs.slice(1)); break
  case "security": printDisclaimer(); break
  case "--version":
  case "-v":       console.info(VERSION); break
  case "help":
  case "--help":
  case "-h":       printHelp(); break
  default:
    console.error(`Unknown command: ${cmd}`)
    printHelp()
    process.exit(1)
}
