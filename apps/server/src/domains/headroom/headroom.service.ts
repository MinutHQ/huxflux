import { z } from "zod"
import type { HeadroomAgentStats, HeadroomInstallState, HeadroomStatus } from "@huxflux/shared"
import { createBinaryResolver } from "../providers/binary.js"
import { logger } from "../../logger.js"
import { isProxyHealthy, startProxy, type ManagedProxy, type ProxySpawnSpec } from "./service/proxyProcess.js"
import { detectInstaller, getInstallState, startInstall } from "./service/install.js"

export const HEADROOM_INSTALL_HINT = 'uv tool install --python 3.13 "headroom-ai[all]"'
const DEFAULT_PORT = 8787
const PORT_ATTEMPTS = 5
const HOST = "127.0.0.1"
const STATS_CACHE_MS = 5_000
const PROJECT_HEADER = "X-Headroom-Project"

const binary = createBinaryResolver({ defaultBin: "headroom", envVar: "HEADROOM_BIN" })

interface State {
  managed: ManagedProxy | null
  pending: Promise<string> | null
  lastError: string | null
  statsCache: { at: number; url: string; body: unknown } | null
}
const state: State = { managed: null, pending: null, lastError: null, statsCache: null }

// Test seam: point the spawn at the fake-headroom fixture instead of the CLI.
let spawnOverride: Pick<ProxySpawnSpec, "bin" | "argsPrefix"> | null = null
export function _setHeadroomSpawnOverride(override: typeof spawnOverride): void { spawnOverride = override }
export async function _resetHeadroom(): Promise<void> {
  await stopHeadroomProxy()
  state.pending = null
  state.lastError = null
  state.statsCache = null
  binary.reset()
}

export const warmHeadroomAvailability = binary.warmAvailability

function configuredPort(): number {
  const raw = Number(process.env.HEADROOM_PORT)
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_PORT
}
const urlFor = (port: number) => `http://${HOST}:${port}`

/** Base URL of a healthy proxy, spawning one when needed. Concurrent callers
 *  share a single in-flight start. Throws with an install hint when the CLI
 *  is missing, or with the spawn/health error otherwise. */
export function ensureHeadroomProxy(): Promise<string> {
  if (state.managed) return Promise.resolve(state.managed.url)
  if (state.pending) return state.pending
  state.pending = ensureInner()
    .then((url) => { state.lastError = null; return url })
    .catch((err: unknown) => { state.lastError = err instanceof Error ? err.message : String(err); throw err })
    .finally(() => { state.pending = null })
  return state.pending
}

async function ensureInner(): Promise<string> {
  const basePort = configuredPort()
  if (await isProxyHealthy(urlFor(basePort))) return urlFor(basePort) // user-run proxy; reuse, never kill
  if (!spawnOverride && !binary.isAvailable()) {
    throw new Error(`Headroom is not installed. Run: ${HEADROOM_INSTALL_HINT}`)
  }
  let lastErr: unknown = null
  for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt++) {
    const port = basePort + attempt
    try {
      const managed = await startProxy({
        bin: spawnOverride?.bin ?? binary.resolve(),
        argsPrefix: spawnOverride?.argsPrefix ?? ["proxy"],
        host: HOST,
        port,
        extraArgs: ["--telemetry"],
        env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.HOME ?? ""}/.local/bin:${process.env.PATH ?? ""}` },
      })
      state.managed = managed
      void managed.exited.then(() => { if (state.managed === managed) state.managed = null })
      logger.info({ port }, "[headroom] proxy ready")
      return managed.url
    } catch (err) {
      lastErr = err
      const reason = (err as { reason?: string }).reason
      logger.warn({ err, port }, `[headroom] proxy start failed (${reason ?? "unknown"})`)
      if (reason !== "exited") break // a health timeout is not a port clash; don't cycle ports
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function stopHeadroomProxy(): Promise<void> {
  const managed = state.managed
  state.managed = null
  if (managed) await managed.stop()
}

/** Env for a Claude Code spawn that should go through the proxy. Pure. */
export function buildHeadroomEnv(agentId: string, baseUrl: string, baseEnv: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const projectLine = `${PROJECT_HEADER}: ${agentId}`
  const existing = baseEnv.ANTHROPIC_CUSTOM_HEADERS ?? ""
  const hasProject = existing.split("\n").some((line) => line.split(":", 1)[0]?.trim().toLowerCase() === PROJECT_HEADER.toLowerCase())
  const customHeaders = hasProject ? existing : existing ? `${existing}\n${projectLine}` : projectLine
  return {
    ANTHROPIC_BASE_URL: baseUrl,
    // Claude Code drops deferred tool loading behind a custom base URL unless
    // this is set, inflating the context by tens of K tokens (headroom #746).
    ENABLE_TOOL_SEARCH: baseEnv.ENABLE_TOOL_SEARCH ?? "true",
    ANTHROPIC_CUSTOM_HEADERS: customHeaders,
  }
}

async function runningProxyUrl(): Promise<string | null> {
  if (state.managed) return state.managed.url
  const url = urlFor(configuredPort())
  return (await isProxyHealthy(url)) ? url : null
}

export async function getHeadroomStatus(): Promise<HeadroomStatus> {
  const [url, installer] = await Promise.all([runningProxyUrl(), detectInstaller()])
  const port = state.managed?.port ?? configuredPort()
  return {
    installed: binary.isAvailable(),
    running: url != null,
    managed: state.managed != null,
    port,
    url,
    error: state.lastError,
    install: getInstallState(),
    canInstall: installer != null,
  }
}

/** Unattended `headroom` install via uv or pipx. Returns immediately with the
 *  running state; `getHeadroomStatus().install` carries progress. On success
 *  the binary resolver is reset and re-warmed so `installed` flips to true. */
export function installHeadroom(): Promise<HeadroomInstallState> {
  return startInstall((ok) => {
    if (!ok) return
    binary.reset()
    void binary.warmAvailability()
  })
}

const numberish = z.number().nullish()
const rawStatsSchema = z.object({
  savings: z.object({
    per_project: z.record(z.string(), z.object({
      requests: numberish,
      tokens_saved: numberish,
      compression_savings_usd: numberish,
      total_input_tokens: numberish,
      savings_percent: numberish,
      last_activity_at: z.string().nullish(),
    }).passthrough()).nullish(),
  }).passthrough().nullish(),
  prefix_cache: z.object({
    compression_vs_cache: z.object({
      tokens_saved_by_compression: numberish,
      tokens_lost_to_cache_bust: numberish,
      cache_bust_count: numberish,
    }).passthrough().nullish(),
    prefix_freeze: z.object({ busts_avoided: numberish }).passthrough().nullish(),
  }).passthrough().nullish(),
}).passthrough()

/** Map the proxy's `/stats` body to the shared shape. Lenient on purpose:
 *  a headroom release that drops or renames a field yields nulls, not 500s. */
export function mapHeadroomAgentStats(raw: unknown, agentId: string): HeadroomAgentStats {
  const parsed = rawStatsSchema.safeParse(raw)
  if (!parsed.success) return { agent: null, proxy: null }
  const row = parsed.data.savings?.per_project?.[agentId]
  const cvc = parsed.data.prefix_cache?.compression_vs_cache
  const freeze = parsed.data.prefix_cache?.prefix_freeze
  return {
    agent: row ? {
      requests: row.requests ?? 0,
      tokensSaved: row.tokens_saved ?? 0,
      savingsPercent: row.savings_percent ?? 0,
      savingsUsd: row.compression_savings_usd ?? 0,
      inputTokens: row.total_input_tokens ?? 0,
      lastActivityAt: row.last_activity_at ?? null,
    } : null,
    proxy: parsed.data.prefix_cache ? {
      tokensSavedByCompression: cvc?.tokens_saved_by_compression ?? null,
      tokensLostToCacheBust: cvc?.tokens_lost_to_cache_bust ?? null,
      cacheBustCount: cvc?.cache_bust_count ?? null,
      bustsAvoided: freeze?.busts_avoided ?? null,
    } : null,
  }
}

async function fetchStats(url: string): Promise<unknown> {
  const cached = state.statsCache
  if (cached && cached.url === url && Date.now() - cached.at < STATS_CACHE_MS) return cached.body
  const res = await fetch(`${url}/stats`, { signal: AbortSignal.timeout(3_000) })
  if (!res.ok) throw new Error(`headroom /stats returned ${res.status}`)
  const body: unknown = await res.json()
  state.statsCache = { at: Date.now(), url, body }
  return body
}

/** Never starts a proxy: no proxy means no stats. */
export async function getHeadroomAgentStats(agentId: string): Promise<HeadroomAgentStats> {
  const url = await runningProxyUrl()
  if (!url) return { agent: null, proxy: null }
  try {
    return mapHeadroomAgentStats(await fetchStats(url), agentId)
  } catch (err) {
    logger.warn({ err }, "[headroom] stats fetch failed")
    return { agent: null, proxy: null }
  }
}
