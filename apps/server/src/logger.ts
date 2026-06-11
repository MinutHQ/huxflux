import pino from "pino"
import { createRequire } from "node:module"
import { isDev } from "./config.js"

// The single logger for all server-runtime logging — jobs, poller, runner, git,
// db, ws, automations, etc. Fastify is wired to this same instance (see
// index.ts) so HTTP request logs and operational logs share one stream and one
// format: human-readable (pino-pretty) in dev, structured JSON in prod.
//
// This replaces the scattered `console.info/warn/error` tracing that used to be
// the convention for background work. The exception is genuine terminal
// presentation — the CLI (cli.ts) and the server startup banner — which stays
// on `console` because it's user-facing output, not logging.
function buildDevStream(): pino.DestinationStream | undefined {
  if (!isDev) return undefined
  try {
    // pino-pretty is a dev dependency and kept external (not bundled), so a
    // synchronous require resolves it from node_modules and makes `logger`
    // usable at import time by every module. Falls back to JSON if absent
    // (the production case, where pretty printing isn't wanted anyway).
    const require = createRequire(import.meta.url)
    const pretty = require("pino-pretty") as (opts: unknown) => pino.DestinationStream
    return pretty({ colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,reqId", singleLine: true })
  } catch {
    return undefined
  }
}

const devStream = buildDevStream()

// Under vitest, drop info-level chatter (migrations, spawn traces) so it doesn't
// bleed into test output — mirroring the harness's silenceLogs() intent — while
// keeping warn/error visible so unexpected failures still surface.
const testLevel = process.env.VITEST === "true" ? "warn" : undefined

export const logger = devStream
  ? pino({ ...(testLevel ? { level: testLevel } : {}) }, devStream)
  : pino(testLevel ? { level: testLevel } : {})
