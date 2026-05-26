#!/usr/bin/env node
// __PKG_VERSION__ is injected at build time by tsup from package.json
declare const __PKG_VERSION__: string
const VERSION = typeof __PKG_VERSION__ !== "undefined" ? __PKG_VERSION__ : "dev"

// Enforce minimum Node.js version — 22.6.0+ required for node:sqlite setReturnArrays
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number)
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 6)) {
  console.error(`\nError: huxflux requires Node.js >= 22.6.0 (current: ${process.versions.node})`)
  console.error(`  Please upgrade Node.js: https://nodejs.org\n`)
  process.exit(1)
}

import { spawn, spawnSync, execFileSync } from "node:child_process"
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
  console.log(`  Connection string (paste into Huxflux web app):`)
  console.log(`\n    ${connStr}\n`)
  try {
    const qr = await qrToString(connStr, { type: "terminal", small: true } as any)
    console.log(`  Scan to connect on mobile:\n`)
    console.log(qr)
  } catch { /* non-fatal */ }
  if (pid) console.log(`  PID:     ${pid}`)
  console.log(`  Logs:    ${LOG_FILE}`)
  console.log(`  Sandbox: ${sandboxStatus(cfg.sandbox)}`)
}

// ── Security disclaimer ───────────────────────────────────────────────────────

function printDisclaimer() {
  console.log(`
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

  console.log(`\nSandbox\n`)

  if (!sb?.enabled) {
    console.log(`  Status:  disabled`)
  } else if (os.platform() !== "linux") {
    console.log(`  Status:  unsupported on macOS`)
  } else if (!firejail) {
    console.log(`  Status:  enabled (firejail not installed — run: sudo apt install firejail)`)
  } else {
    console.log(`  Status:  active`)
  }

  const extras = sb?.allowedBinaries ?? []
  const builtins = ["git", "node", "claude", "sh", "bash", "curl"]
  console.log(`  Built-in binaries:  ${builtins.join(", ")}`)
  console.log(`  Extra binaries:     ${extras.length > 0 ? extras.join(", ") : "(none)"}`)
  console.log(`  Paths:              derived from registered repos + ${DATA_DIR}\n`)
  console.log(`Commands:`)
  console.log(`  huxflux sandbox add <bin> [bin...]   Allow extra binaries`)
  console.log(`  huxflux sandbox remove <bin>         Revoke a binary`)
  console.log(`  huxflux sandbox enable               Enable sandboxing`)
  console.log(`  huxflux sandbox disable              Disable sandboxing`)
  console.log(`  huxflux sandbox setup                Interactive first-time setup\n`)
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
    if (added.length === 0) { console.log("Nothing to add — all listed binaries already allowed."); return }
    cfg.sandbox = { enabled: cfg.sandbox?.enabled ?? true, allowedBinaries: [...current, ...added] }
    saveConfig(cfg)
    console.log(`Added: ${added.join(", ")}`)
    console.log(`Allowed now: ${cfg.sandbox.allowedBinaries.join(", ")}`)
    console.log(`\nRestart to apply: huxflux stop && huxflux start`)
    return
  }

  if (sub === "remove") {
    if (rest.length === 0) { console.error("Usage: huxflux sandbox remove <bin>"); process.exit(1) }
    const current = cfg.sandbox?.allowedBinaries ?? []
    const next = current.filter((b) => !rest.includes(b))
    const removed = current.filter((b) => rest.includes(b))
    if (removed.length === 0) { console.log(`Not in allowed list: ${rest.join(", ")}`); return }
    cfg.sandbox = { enabled: cfg.sandbox?.enabled ?? true, allowedBinaries: next }
    saveConfig(cfg)
    console.log(`Removed: ${removed.join(", ")}`)
    console.log(`Allowed now: ${next.length > 0 ? next.join(", ") : "(none)"}`)
    console.log(`\nRestart to apply: huxflux stop && huxflux start`)
    return
  }

  if (sub === "enable") {
    cfg.sandbox = { enabled: true, allowedBinaries: cfg.sandbox?.allowedBinaries ?? [] }
    saveConfig(cfg)
    if (!isFirejailAvailable() && os.platform() === "linux") {
      console.log("Sandbox enabled — but firejail is not installed:")
      console.log("  sudo apt install firejail")
    } else {
      console.log("Sandbox enabled. Restart to apply: huxflux stop && huxflux start")
    }
    return
  }

  if (sub === "disable") {
    cfg.sandbox = { enabled: false, allowedBinaries: cfg.sandbox?.allowedBinaries ?? [] }
    saveConfig(cfg)
    console.log("Sandbox disabled. Restart to apply: huxflux stop && huxflux start")
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
    console.log("Sandbox via firejail is only supported on Linux.")
    process.exit(0)
  }

  if (!isFirejailAvailable()) {
    console.log("\nfirejail is not installed:\n")
    console.log("  sudo apt install firejail     # Debian/Ubuntu")
    console.log("  sudo dnf install firejail     # Fedora/RHEL")
    console.log("  sudo pacman -S firejail       # Arch\n")
    process.exit(1)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const existing = cfg.sandbox?.allowedBinaries ?? []

  console.log("\nhuxflux sandbox setup\n")
  console.log("Repo paths are automatic — derived from repos registered in the web app.")
  console.log(`Built-in: git, node, claude, sh, bash, curl`)
  if (existing.length > 0) console.log(`Currently allowed extras: ${existing.join(", ")}`)
  console.log("")

  const binsInput = await prompt(rl, "Extra CLIs to allow (comma-separated, or Enter for none):\n> ")
  rl.close()

  const allowedBinaries = binsInput.split(",").map((b) => b.trim()).filter(Boolean)

  cfg.sandbox = { enabled: true, allowedBinaries }
  saveConfig(cfg)

  console.log("\nSandbox configured:")
  console.log(`  Extra binaries: ${allowedBinaries.length > 0 ? allowedBinaries.join(", ") : "none"}`)
  console.log(`\nRestart to apply: huxflux stop && huxflux start\n`)
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdStart() {
  const existing = getRunningPid()
  if (existing) {
    console.log(`huxflux is already running  (PID ${existing})`)
    console.log(`  Status: huxflux status`)
    console.log(`  Logs:   huxflux logs`)
    process.exit(0)
  }

  const cfg = loadConfig()
  const isFirstStart = !cfg.disclaimerShown

  if (isFirstStart) {
    printDisclaimer()
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
    console.error("Failed to start server")
    process.exit(1)
  }

  fs.writeFileSync(PID_FILE, String(child.pid))

  // Wait for the server to bind and write its port file (up to 5s)
  const deadline = Date.now() + 5000
  while (!fs.existsSync(PORT_FILE) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }

  console.log(`\nhuxflux started\n`)
  await printConnectInfo(cfg, child.pid)
  console.log(`\n  huxflux logs    — tail the server log`)
  console.log(`  huxflux crashes — tail the crash log`)
  console.log(`  huxflux stop    — stop the server`)
  if (!cfg.sandbox?.enabled && os.platform() === "linux") {
    console.log(`\n  Tip: run 'huxflux sandbox' to restrict Claude's file access.`)
  }
  console.log("")
}

// ── Supervisor — restarts the server on crash ────────────────────────────────

function runSupervisor() {
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

function cmdStop() {
  const pid = getRunningPid()
  if (!pid) {
    console.log("huxflux is not running")
    process.exit(0)
  }
  try { process.kill(pid, "SIGTERM") } catch { /* already gone */ }
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
  if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE)
  console.log(`huxflux stopped  (PID ${pid})`)
}

async function cmdStatus() {
  const pid = getRunningPid()
  const cfg = loadConfig()

  if (!pid) {
    console.log("huxflux  stopped\n")
    console.log("Run 'huxflux start' to start the server.")
    return
  }

  console.log(`huxflux  running  (PID ${pid})\n`)
  await printConnectInfo(cfg)
}

function cmdLogs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log("No logs yet. Start the server first: huxflux start")
    process.exit(1)
  }
  const tail = spawn("tail", ["-f", "-n", "100", LOG_FILE], { stdio: "inherit" })
  tail.on("close", (code) => process.exit(code ?? 0))
  process.on("SIGINT", () => { tail.kill(); process.exit(0) })
}

function cmdCrashes() {
  if (!fs.existsSync(CRASH_LOG)) {
    console.log("No crashes recorded.")
    process.exit(0)
  }
  const tail = spawn("tail", ["-f", "-n", "50", CRASH_LOG], { stdio: "inherit" })
  tail.on("close", (code) => process.exit(code ?? 0))
  process.on("SIGINT", () => { tail.kill(); process.exit(0) })
}

function cmdAudit() {
  const auditLog = path.join(DATA_DIR, "audit.log")
  if (!fs.existsSync(auditLog)) {
    console.log("No audit log yet. Start the server first: huxflux start")
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
    console.log(`\nNew token generated.\n`)
    console.log(`  Update the web app with the new connection string:`)
    console.log(`\n    ${connectionString(cfg)}\n`)
    console.log(`  Restart to apply: huxflux stop && huxflux start\n`)
    return
  }
  console.log(cfg.token)
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

  console.log(`\nRestore from ${slotLabel}`)
  console.log(`  Source:  ${src}`)
  console.log(`  Created: ${backupStat.mtime.toISOString()}  (${ageLabel})`)
  if (fs.existsSync(DB_FILE)) {
    const dbStat = fs.statSync(DB_FILE)
    console.log(`  Current: ${DB_FILE}  (${Math.round((Date.now() - dbStat.mtimeMs) / 1000 / 60)}m old)`)
  }
  console.log("")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question("Replace current database with this backup? [y/N] ", (answer) => {
    rl.close()
    if (answer.toLowerCase() !== "y") {
      console.log("Aborted.")
      process.exit(0)
    }

    // Save the current DB as a pre-restore snapshot before overwriting
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, DB_FILE + ".pre-restore")
      console.log(`  Saved current DB → ${DB_FILE}.pre-restore`)
    }

    fs.copyFileSync(src, DB_FILE)
    console.log(`  Restored ${src} → ${DB_FILE}`)
    console.log("\nDone. Run 'huxflux start' to restart.\n")
  })
}

async function cmdReset() {
  const pid = getRunningPid()
  if (pid) {
    console.error("huxflux is running — stop it first: huxflux stop")
    process.exit(1)
  }

  console.log(`
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
  if (a1.toLowerCase() !== "y") { rl.close(); console.log("\n  Aborted.\n"); process.exit(0) }

  const a2 = await prompt(rl, "  Confirmation 2/3 — Type \"yes\" to continue: ")
  if (a2 !== "yes") { rl.close(); console.log("\n  Aborted.\n"); process.exit(0) }

  const a3 = await prompt(rl, "  Confirmation 3/3 — Type \"huxflux\" to confirm the reset: ")
  rl.close()
  if (a3 !== "huxflux") { console.log("\n  Aborted.\n"); process.exit(0) }

  console.log("")
  for (const f of [DB_FILE, DB_BAK, DB_BAK2]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f)
      console.log(`  Deleted ${f}`)
    }
  }
  if (fs.existsSync(WORKSPACES)) {
    fs.rmSync(WORKSPACES, { recursive: true, force: true })
    console.log(`  Deleted ${WORKSPACES}`)
  }
  console.log("\n  Reset complete. Run 'huxflux start' for a fresh instance.")
  console.log("  Tip: run 'git worktree prune' in each repo to remove stale refs.\n")
}

const WEB_APP_URL = "https://huxflux.netlify.app"

function cmdOpen(host?: string) {
  const cfg = loadConfig()
  const pid = getRunningPid()
  if (!pid) {
    console.log("huxflux is not running — start it first: huxflux start")
    process.exit(1)
  }
  const conn = connectionString(cfg, host ?? "localhost")
  const url = `${WEB_APP_URL}/?connect=${encodeURIComponent(conn)}`
  console.log(`Opening ${WEB_APP_URL}`)
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  spawnSync(opener, [url], { stdio: "inherit", shell: true })
}

function cmdUpdate() {
  console.log(`\nUpdating huxflux (current: ${VERSION})...\n`)
  let result = spawnSync("npm install -g @alexmartosp/huxflux@latest", [], { stdio: "inherit", shell: true })
  if (result.status !== 0) {
    console.log("\nRetrying with sudo...")
    result = spawnSync("sudo npm install -g @alexmartosp/huxflux@latest", [], { stdio: "inherit", shell: true })
  }
  if (result.status !== 0) {
    console.error("\nUpdate failed. Run manually:")
    console.error("  npm install -g @alexmartosp/huxflux@latest")
    console.error("  # or: sudo npm install -g @alexmartosp/huxflux@latest\n")
    process.exit(result.status ?? 1)
  }
  console.log(`\nUpdate complete. Restart to apply: huxflux stop && huxflux start\n`)
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

  console.log("")
  p.intro("⚡ Huxflux Setup")

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
  ]
  const hasDesktop = !isHeadless && desktopPaths.some(dp => fs.existsSync(dp))
  const canInstallDesktop = !isHeadless && (platform === "darwin" || platform === "linux")

  const platformLabel = platform === "darwin" ? `macOS ${arch === "arm64" ? "Apple Silicon" : "Intel"}`
    : platform === "linux" ? "Linux x86_64" : platform === "win32" ? "Windows" : platform
  const envLabel = isHeadless
    ? (process.env.SSH_CONNECTION ? "Remote (SSH)" : fs.existsSync("/.dockerenv") ? "Docker" : "Headless")
    : "Local"

  p.log.step("Scanning your system...")
  p.log.info(`Platform:    ${platformLabel}`)
  p.log.info(`Environment: ${envLabel}`)
  p.log.info(`Data:        ${DATA_DIR}`)

  if (serverRunning) p.log.success("Server:      running ✓")
  else if (dbExists)  p.log.warning("Server:      installed but not running")
  else                p.log.warning("Server:      not set up yet")

  if (isHeadless) {
    p.log.info("Desktop:     not available (headless environment)")
  } else if (hasDesktop) {
    p.log.success("Desktop:     installed ✓")
  } else {
    p.log.info("Desktop:     not installed")
  }

  // ── Nothing to do? ──
  if (serverRunning && (hasDesktop || isHeadless)) {
    const conn = fs.existsSync(connectionFile)
      ? JSON.parse(fs.readFileSync(connectionFile, "utf-8"))
      : null

    p.log.success("Everything is set up!")
    if (conn) {
      p.log.info(`API:    ${conn.url}`)
      p.log.info(`Web UI: ${conn.url}`)
      if (isHeadless) {
        const connStr = connectionString(loadConfig())
        p.log.message(`\n  Connect from your desktop:\n\n    ${connStr}\n`)
        try {
          const qr = await qrToString(connStr, { type: "terminal", small: true })
          console.log(qr)
        } catch {}
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
      label: dbExists ? "Start server" : "Set up server",
      hint: dbExists ? "resume existing setup" : "API + Web UI",
    })
  }
  if (canInstallDesktop && !hasDesktop) {
    options.push({ value: "desktop", label: "Install desktop app", hint: platformLabel })
  }

  if (options.length === 0) {
    // Headless with server already running
    p.outro("Nothing to set up. Run 'huxflux status' for server details.")
    return
  }

  const components = await p.multiselect({
    message: "What would you like to set up?",
    options,
    initialValues: options.map(o => o.value),
    required: false,
  })

  if (p.isCancel(components)) {
    p.cancel("Setup cancelled.")
    process.exit(0)
  }

  const selected = components as string[]

  // ── Start server ──
  if (selected.includes("server")) {
    const s = p.spinner()
    s.start(dbExists ? "Starting server..." : "Setting up server...")

    try {
      await cmdStart()
      // Wait for connection.json
      for (let i = 0; i < 30; i++) {
        if (fs.existsSync(connectionFile)) break
        await new Promise(r => setTimeout(r, 500))
      }
      s.stop("Server running ✓")

      if (fs.existsSync(connectionFile)) {
        const conn = JSON.parse(fs.readFileSync(connectionFile, "utf-8"))
        p.log.success(`API:    ${conn.url}`)
        p.log.success(`Web UI: ${conn.url}`)
        p.log.info(`Open ${conn.url} in your browser to get started`)
      }

      // Offer to install as a system service (auto-start on boot)
      const canService = platform === "darwin" || platform === "linux"
      if (canService) {
        const installService = await p.confirm({ message: "Start Huxflux automatically on boot?" })
        if (!p.isCancel(installService) && installService) {
          try {
            installSystemService()
            p.log.success("System service installed — Huxflux will start on boot")
          } catch (err: any) {
            p.log.warning(`Could not install service: ${err.message}`)
            p.log.info("You can start manually with: huxflux start")
          }
        }
      }

      // On headless: show connection string + QR
      if (isHeadless) {
        const cfg = loadConfig()
        const connStr = connectionString(cfg)
        p.log.step("Connect from your desktop or browser:")
        p.log.message(`\n    ${connStr}\n`)
        try {
          const qr = await qrToString(connStr, { type: "terminal", small: true })
          console.log(qr)
        } catch {}
        p.log.warning("Security: Use Tailscale or a reverse proxy for encrypted access.")
        p.log.info("Run 'huxflux security' for full recommendations.")
      }
    } catch (err: any) {
      s.stop("Failed to start server")
      p.log.error(err.message || "Unknown error")
    }
  }

  // ── Install desktop (only on local machines with a display) ──
  if (selected.includes("desktop")) {
    const s = p.spinner()
    s.start("Fetching latest desktop release...")

    try {
      const releaseUrl = "https://github.com/AlexMartosP/huxflux-releases/releases/latest/download/latest.json"
      const res = await fetch(releaseUrl)
      const release = await res.json() as { version: string; platforms: Record<string, { url: string }> }

      const platformKey = platform === "darwin"
        ? (arch === "arm64" ? "darwin-aarch64" : "darwin-x86_64")
        : platform === "linux" ? "linux-x86_64" : null

      if (platformKey && release.platforms[platformKey]) {
        const downloadUrl = release.platforms[platformKey].url
        s.stop(`Desktop v${release.version} available for download`)

        // Try to download and install automatically on macOS
        if (platform === "darwin") {
          const installDesktop = await p.confirm({ message: `Download and install Huxflux Desktop v${release.version}?` })
          if (!p.isCancel(installDesktop) && installDesktop) {
            const ds = p.spinner()
            ds.start("Downloading...")

            try {
              const tmpDir = path.join(os.tmpdir(), `huxflux-desktop-${Date.now()}`)
              fs.mkdirSync(tmpDir, { recursive: true })
              const tarPath = path.join(tmpDir, "huxflux.tar.gz")

              // Download
              const dlRes = await fetch(downloadUrl)
              const buffer = Buffer.from(await dlRes.arrayBuffer())
              fs.writeFileSync(tarPath, buffer)

              // Extract
              spawnSync("tar", ["-xzf", tarPath, "-C", tmpDir], { stdio: "pipe" })

              // Move to Applications
              const appName = fs.readdirSync(tmpDir).find(f => f.endsWith(".app"))
              if (appName) {
                const dest = `/Applications/${appName}`
                if (fs.existsSync(dest)) spawnSync("rm", ["-rf", dest], { stdio: "pipe" })
                spawnSync("mv", [path.join(tmpDir, appName), dest], { stdio: "pipe" })
                ds.stop("Desktop installed ✓")
                p.log.success(`Installed to /Applications/${appName}`)

                // Open the app
                const openApp = await p.confirm({ message: "Open Huxflux Desktop now?" })
                if (!p.isCancel(openApp) && openApp) {
                  spawnSync("open", [dest], { stdio: "pipe" })
                  p.log.success("Desktop app opened — it will auto-connect to your local server")
                }
              } else {
                ds.stop("Extraction failed")
                p.log.warning("Could not find .app in downloaded archive")
              }

              // Cleanup
              try { fs.rmSync(tmpDir, { recursive: true }) } catch {}
            } catch (dlErr: any) {
              ds.stop("Download failed")
              p.log.error(dlErr.message)
              p.log.info(`Manual download: ${downloadUrl}`)
            }
          }
        } else {
          p.log.info(`Download: ${downloadUrl}`)
          p.log.message("Download and install the desktop app from the URL above.")
          p.log.info("The desktop app will auto-connect to your local server.")
        }
      } else {
        s.stop("No desktop build for this platform")
        p.log.warning(`Desktop builds are not available for ${platform}-${arch}`)
        p.log.info("Use the web UI instead: open the server URL in your browser")
      }
    } catch (err: any) {
      s.stop("Could not fetch release info")
      p.log.error("Check: https://github.com/AlexMartosP/huxflux-releases/releases")
    }
  }

  // ── Summary ──
  console.log("")
  p.log.step("Quick reference:")
  p.log.info("huxflux status     Show server URL and token")
  p.log.info("huxflux logs       Tail the server log")
  p.log.info("huxflux stop       Stop the server")
  p.log.info("huxflux update     Update all components")
  p.log.info("huxflux security   Security recommendations")
  p.outro("You're all set! 🚀")
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
    console.log(`
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
  const huxfluxBin = process.argv[1] // path to the CLI entry

  if (platform === "darwin") {
    // macOS: LaunchAgent (runs as current user, starts on login)
    const plistDir = path.join(os.homedir(), "Library", "LaunchAgents")
    fs.mkdirSync(plistDir, { recursive: true })
    const plistPath = path.join(plistDir, "com.huxflux.server.plist")
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.huxflux.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${SERVER_ENTRY}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>HUXFLUX_DIR</key>
    <string>${DATA_DIR}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:${path.dirname(process.execPath)}</string>
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
    // Linux: systemd user service
    const serviceDir = path.join(os.homedir(), ".config", "systemd", "user")
    fs.mkdirSync(serviceDir, { recursive: true })
    const servicePath = path.join(serviceDir, "huxflux.service")
    const service = `[Unit]
Description=Huxflux Server
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${SERVER_ENTRY}
Environment=NODE_ENV=production
Environment=HUXFLUX_DIR=${DATA_DIR}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`
    fs.writeFileSync(servicePath, service)
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

  console.log("")
  p.intro("Uninstall Huxflux")

  // Detect what's installed
  const pid = getRunningPid()
  const desktopPaths = [
    "/Applications/Huxflux.app",
    path.join(os.homedir(), "Applications", "Huxflux.app"),
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
  try { removeSystemService() } catch {}
  s0.stop("System service removed ✓")

  // Stop server
  if (pid) {
    const s = p.spinner()
    s.start("Stopping server...")
    try { process.kill(pid, "SIGTERM") } catch {}
    await new Promise(r => setTimeout(r, 2000))
    try { fs.unlinkSync(path.join(DATA_DIR, "server.pid")) } catch {}
    try { fs.unlinkSync(path.join(DATA_DIR, "server.port")) } catch {}
    try { fs.unlinkSync(path.join(DATA_DIR, "connection.json")) } catch {}
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
  p.log.message("\n    npm uninstall -g @alexmartosp/huxflux\n")
  p.outro("Huxflux has been uninstalled.")
}

// ── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
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
  case "data":      cmdData(cmdArgs[0], cmdArgs[1]).catch(console.error); break
  case "uninstall": cmdUninstall().catch(console.error); break
  case "sandbox":  cmdSandbox(cmdArgs[0], ...cmdArgs.slice(1)); break
  case "security": printDisclaimer(); break
  case "--version":
  case "-v":       console.log(VERSION); break
  case "help":
  case "--help":
  case "-h":       printHelp(); break
  default:
    console.error(`Unknown command: ${cmd}`)
    printHelp()
    process.exit(1)
}
