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
    DB_PATH: path.join(DATA_DIR, "huxflux.db"),
    WORKSPACES_BASE: path.join(DATA_DIR, "workspaces"),
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

  const logFd = fs.openSync(LOG_FILE, "a")
  const child = spawn(process.execPath, [SERVER_ENTRY], {
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
  console.log(`\n  huxflux logs   — tail the server log`)
  console.log(`  huxflux stop   — stop the server`)
  if (!cfg.sandbox?.enabled && os.platform() === "linux") {
    console.log(`\n  Tip: run 'huxflux sandbox' to restrict Claude's file access.`)
  }
  console.log("")
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

function printHelp() {
  console.log(`
huxflux — Huxflux server

Usage:
  huxflux [start]   Start the server in the background
  huxflux open [host]   Open the web app and auto-connect to this server
  huxflux stop      Stop the running server
  huxflux status    Show server status, URL, and auth token
  huxflux logs      Tail the server log (Ctrl+C to exit)
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
  case "start":    cmdStart().catch(console.error); break
  case "open":     cmdOpen(cmdArgs[0]); break
  case "stop":     cmdStop(); break
  case "status":   cmdStatus().catch(console.error); break
  case "logs":     cmdLogs(); break
  case "run":      cmdRun(); break
  case "token":    cmdToken(cmdArgs[0]); break
  case "audit":    cmdAudit(); break
  case "restore":  cmdRestore(cmdArgs[0]); break
  case "reset":    cmdReset().catch(console.error); break
  case "update":   cmdUpdate(); break
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
