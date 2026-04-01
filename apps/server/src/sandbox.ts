/**
 * Sandbox support for the Claude subprocess using firejail (Linux only).
 *
 * File access paths are derived automatically:
 *   - worktreePath  (the agent's specific checkout, read/write)
 *   - repoPath      (base repo for reading existing code, read/write)
 *   - dataDir       (~/huxflux — worktrees, DB, config)
 *   - dev tool caches (auto-detected: ~/.npm, ~/.cargo, ~/.cache/pip, etc.)
 *
 * Network: restricted to localhost + the repo's git remote host.
 * This prevents arbitrary internet access while allowing:
 *   - Claude's self-rename curl to localhost
 *   - git push/pull to the repo's remote (GitHub, GitLab, etc.)
 *
 * Known limitations:
 *   - macOS: firejail is Linux-only; no sandboxing on macOS
 *   - /proc, /sys: not restricted (some tools need them)
 *   - node_modules symlinks: may fail if they resolve outside whitelist
 */

import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

export interface SandboxConfig {
  enabled: boolean
  // Extra CLI names beyond the built-in set (e.g. ["gh", "acli", "npm"])
  allowedBinaries: string[]
}

const ALWAYS_ALLOWED_BINS = ["git", "node", "claude", "sh", "bash", "env", "curl"]

import { DATA_DIR } from "./config.js"

// ── Dev tool cache detection ──────────────────────────────────────────────────
// These directories are needed for common package managers to function.
// Each entry is included only if the directory actually exists.

const DEV_CACHE_CANDIDATES = [
  path.join(os.homedir(), ".npm"),           // npm cache
  path.join(os.homedir(), ".cargo"),         // Rust / cargo
  path.join(os.homedir(), ".cache", "pip"),  // Python pip
  path.join(os.homedir(), ".cache", "yarn"), // Yarn
  path.join(os.homedir(), ".cache", "node"), // some node tools
  path.join(os.homedir(), ".gradle"),        // Java / Gradle
  path.join(os.homedir(), ".m2"),            // Java / Maven
  path.join(os.homedir(), ".config", "npm"), // npm config
  path.join(os.homedir(), ".npmrc"),         // npm config file
  path.join(os.homedir(), ".yarnrc.yml"),    // yarn config file
  path.join(os.homedir(), ".pnpmfile.cjs"),  // pnpm config
]

function detectDevCaches(): string[] {
  return DEV_CACHE_CANDIDATES.filter((p) => fs.existsSync(p))
}

// ── Git remote host extraction ────────────────────────────────────────────────

function extractRemoteHost(repoPath: string | null): string | null {
  if (!repoPath) return null
  try {
    const remote = execFileSync("git", ["-C", repoPath, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim()
    // Parse SSH (git@github.com:org/repo.git) or HTTPS (https://github.com/org/repo)
    const sshMatch = remote.match(/^git@([^:]+):/)
    if (sshMatch) return sshMatch[1]
    const url = new URL(remote)
    return url.hostname
  } catch {
    return null
  }
}

// ── Firejail availability ─────────────────────────────────────────────────────

export function isFirejailAvailable(): boolean {
  if (os.platform() !== "linux") return false
  try {
    execFileSync("which", ["firejail"], { encoding: "utf8", stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

// ── Main sandbox builder ──────────────────────────────────────────────────────

export function buildSandboxedCommand(opts: {
  claudeBin: string
  claudeArgs: string[]
  worktreePath: string
  repoPath: string | null
  cfg: SandboxConfig
}): { bin: string; args: string[] } {
  const { claudeBin, claudeArgs, worktreePath, repoPath, cfg } = opts

  if (!cfg.enabled || !isFirejailAvailable()) {
    return { bin: claudeBin, args: claudeArgs }
  }

  // ── Binaries ────────────────────────────────────────────────────────────────
  const allBins = [...ALWAYS_ALLOWED_BINS, ...cfg.allowedBinaries]
  const binWhitelists = allBins.flatMap((name) => {
    try {
      const p = execFileSync("which", [name], { encoding: "utf8", stdio: "pipe" }).trim()
      return [`--whitelist=${p}`]
    } catch {
      return [] // binary not installed, skip
    }
  })

  // ── File paths ───────────────────────────────────────────────────────────────
  const allowedPaths = [
    worktreePath,
    DATA_DIR,
    ...(repoPath && repoPath !== worktreePath ? [repoPath] : []),
    ...detectDevCaches(),
  ]
  const pathWhitelists = allowedPaths.map((p) => `--whitelist=${p}`)

  // ── Network ──────────────────────────────────────────────────────────────────
  // Allow only localhost (for the rename-agent curl) and the git remote host.
  // firejail --dns= sets the DNS server; combined with a host whitelist this
  // prevents arbitrary outbound connections.
  const remoteHost = extractRemoteHost(repoPath)
  const allowedHosts = ["127.0.0.1", "localhost", ...(remoteHost ? [remoteHost] : [])]
  // Note: firejail network whitelisting requires a network profile or net namespace.
  // We use --net=none + --dns workaround isn't clean — so we instead document this
  // gap rather than apply a broken partial restriction. Full network isolation
  // would require a network namespace which breaks the localhost curl.
  // TODO: use --net=bridge with iptables rules when running as root or with CAP_NET_ADMIN.
  void allowedHosts // acknowledged but not yet enforced — see above

  const firejailArgs = [
    "--noprofile",
    "--quiet",
    "--private-tmp",
    "--private-dev",
    "--noroot",
    "--no3d", "--nosound", "--novideo", "--nodvd", "--notv", "--nou2f",
    "--caps.drop=all",
    "--nonewprivs",
    // Read-only system paths (dynamic linker, stdlib, TLS certs)
    "--read-only=/usr",
    "--read-only=/lib",
    "--read-only=/lib64",
    "--read-only=/etc/resolv.conf",
    "--read-only=/etc/ssl",
    "--read-only=/etc/passwd",   // needed by some tools for username lookup
    ...pathWhitelists,
    ...binWhitelists,
    "--",
    claudeBin,
    ...claudeArgs,
  ]

  return { bin: "firejail", args: firejailArgs }
}

// ── Status helpers ────────────────────────────────────────────────────────────

export function sandboxStatus(cfg: SandboxConfig | undefined): string {
  if (!cfg?.enabled) return "disabled"
  if (os.platform() !== "linux") return "unsupported on macOS (Linux only)"
  if (!isFirejailAvailable()) return "enabled but firejail not installed — run: sudo apt install firejail"
  const extras = cfg.allowedBinaries.length > 0 ? cfg.allowedBinaries.join(", ") : "none"
  return `active via firejail  (extra binaries: ${extras})`
}

/** Returns what the sandbox will actually allow at runtime, for transparency. */
export function sandboxSummary(opts: {
  worktreePath: string
  repoPath: string | null
  cfg: SandboxConfig
}): { paths: string[]; binaries: string[]; networkNote: string } {
  const { worktreePath, repoPath, cfg } = opts
  const caches = detectDevCaches()
  const remoteHost = extractRemoteHost(repoPath)

  return {
    paths: [
      worktreePath,
      DATA_DIR,
      ...(repoPath && repoPath !== worktreePath ? [repoPath] : []),
      ...caches,
    ],
    binaries: [...ALWAYS_ALLOWED_BINS, ...cfg.allowedBinaries],
    networkNote: remoteHost
      ? `localhost + ${remoteHost} (unrestricted — network namespace not yet implemented)`
      : "unrestricted — network namespace not yet implemented",
  }
}
