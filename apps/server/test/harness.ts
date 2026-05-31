/* eslint-disable @typescript-eslint/no-explicit-any */
// Server test harness. Helpers tests call to get a fresh in-memory DB,
// throwaway git repo, silenced logs, and a WS-event capture buffer.
//
// Pattern: every helper returns an object with a `cleanup` (or `restore`)
// function. Use `afterEach(() => h.cleanup())` to keep tests isolated.

import { DatabaseSync } from "node:sqlite"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDbFromRaw, setDb, _resetDb, runMigrations } from "../src/db/index.js"
import { registerSocket } from "../src/domains/ws/handler.js"
import type { ServerEvent } from "../src/domains/ws/events.js"

export interface TestDb {
  db: any
  close: () => void
}

/**
 * Boot an isolated in-memory SQLite database, run every migration in order,
 * and swap it in as the active `db` singleton. Tests call `close()` in their
 * `afterEach` to restore the production binding and free the connection.
 */
export function createTestDb(): TestDb {
  const raw = new DatabaseSync(":memory:")
  const instance = createDbFromRaw(raw)
  setDb(instance)
  runMigrations()
  return {
    db: instance.db,
    close: () => {
      try { raw.close() } catch { /* already closed */ }
      _resetDb()
    },
  }
}

export interface GitTmpRepo {
  path: string
  cleanup: () => void
}

/**
 * Create a tmp directory, `git init` it, set a deterministic user.email and
 * user.name, and make an initial empty commit on `main`. Used by file-change
 * and worktree tests so they never touch the developer's real repos.
 */
export function createGitTmpRepo(): GitTmpRepo {
  const path = mkdtempSync(join(tmpdir(), "huxflux-test-repo-"))
  const opts = { cwd: path, stdio: "ignore" as const }
  execFileSync("git", ["init", "-q", "-b", "main"], opts)
  execFileSync("git", ["config", "user.email", "test@huxflux.local"], opts)
  execFileSync("git", ["config", "user.name", "Huxflux Test"], opts)
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], opts)
  return {
    path,
    cleanup: () => {
      try { rmSync(path, { recursive: true, force: true }) } catch { /* gone */ }
    },
  }
}

export interface SilencedLogs {
  logs: string[]
  errors: string[]
  warnings: string[]
  restore: () => void
}

/**
 * Replace `console.log` / `console.error` / `console.warn` with no-op
 * collectors so test output stays clean even when production code logs
 * `[runner]` / `[meta]` chatter. Tests can read `logs[]` to assert.
 */
export function silenceLogs(): SilencedLogs {
  const logs: string[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const origLog = console.log
  const origErr = console.error
  const origWarn = console.warn
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")) }
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")) }
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
  return {
    logs, errors, warnings,
    restore: () => {
      console.log = origLog
      console.error = origErr
      console.warn = origWarn
    },
  }
}

export interface CapturedWsEvents {
  events: ServerEvent[]
  restore: () => void
}

/**
 * Register a fake WebSocket that subscribes to every agent id seen on the wire
 * AND captures broadcast events. Returns `events`, which accumulates every
 * payload `agentsWs.*(...)` sends, in order. Tests can assert against shape
 * (event types, payload contents) directly.
 *
 * The fake socket is added to the handler's internal `allSockets` set via the
 * real `registerSocket` call. To also capture per-agent `emit()` calls, the
 * caller passes `agentIds` it cares about — the harness sends a `subscribe`
 * frame to the handler for each.
 */
export function captureWsEvents(agentIds: string[] = []): CapturedWsEvents {
  const events: ServerEvent[] = []
  const messageHandlers: Array<(raw: string) => void> = []
  const closeHandlers: Array<() => void> = []

  const socket = {
    readyState: 1,
    OPEN: 1,
    send: (payload: string) => {
      try { events.push(JSON.parse(payload) as ServerEvent) } catch { /* not JSON */ }
    },
    on: (event: string, handler: (...args: any[]) => void) => {
      if (event === "message") messageHandlers.push(handler as (raw: string) => void)
      else if (event === "close") closeHandlers.push(handler as () => void)
    },
  }

  // The fake socket only implements the methods registerSocket touches in tests.
  registerSocket(socket as any)

  for (const agentId of agentIds) {
    for (const h of messageHandlers) {
      h(JSON.stringify({ type: "subscribe", agentId }))
    }
  }

  return {
    events,
    restore: () => {
      for (const h of closeHandlers) h()
    },
  }
}

/** Wait for a predicate to hold, polling every `intervalMs`. */
export async function waitFor<T>(
  predicate: () => T | undefined | false,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 25 } = options
  const start = Date.now()
  for (;;) {
    const value = predicate()
    if (value) return value
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs}ms`)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
