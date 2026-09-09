import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as net from "node:net"
import { freePort, silenceLogs, type SilencedLogs } from "../../../test/harness.js"
import { startProxy, type ManagedProxy } from "./service/proxyProcess.js"
import {
  _resetHeadroom,
  _setHeadroomSpawnOverride,
  buildHeadroomEnv,
  ensureHeadroomProxy,
  getHeadroomAgentStats,
  getHeadroomStatus,
  mapHeadroomAgentStats,
  stopHeadroomProxy,
} from "./headroom.service.js"

const __filename = fileURLToPath(import.meta.url)
const SERVER_ROOT = path.resolve(path.dirname(__filename), "..", "..", "..")
const FAKE_HEADROOM = path.join(SERVER_ROOT, "test", "fixtures", "fake-headroom.mjs")

const STATS_FIXTURE = {
  savings: {
    total_tokens: 1234,
    per_project: {
      "agent-a": {
        requests: 4, tokens_saved: 900, compression_savings_usd: 0.0123,
        total_input_tokens: 2100, savings_percent: 30, last_activity_at: "2026-09-09T10:00:00Z",
      },
    },
  },
  prefix_cache: {
    compression_vs_cache: { tokens_saved_by_compression: 900, tokens_lost_to_cache_bust: 50, cache_bust_count: 1 },
    prefix_freeze: { busts_avoided: 7 },
  },
}

describe("headroom.service", () => {
  let logs: SilencedLogs
  let savedEnv: NodeJS.ProcessEnv
  let external: ManagedProxy | null = null

  beforeEach(() => {
    logs = silenceLogs()
    savedEnv = { ...process.env }
    _setHeadroomSpawnOverride({ bin: process.execPath, argsPrefix: [FAKE_HEADROOM, "proxy"] })
  })
  afterEach(async () => {
    await _resetHeadroom()
    _setHeadroomSpawnOverride(null)
    await external?.stop()
    external = null
    process.env = savedEnv
    logs.restore()
  })

  it("spawns a managed proxy on HEADROOM_PORT and shares one start between concurrent callers", async () => {
    const port = await freePort()
    process.env.HEADROOM_PORT = String(port)
    process.env.HUXFLUX_FAKE_HEADROOM_DELAY_MS = "300"
    const [a, b] = await Promise.all([ensureHeadroomProxy(), ensureHeadroomProxy()])
    expect(a).toBe(`http://127.0.0.1:${port}`)
    expect(b).toBe(a)
    const status = await getHeadroomStatus()
    expect(status.running).toBe(true)
    expect(status.managed).toBe(true)
    expect(status.port).toBe(port)
    expect(status.url).toBe(a)
    await stopHeadroomProxy()
    expect((await getHeadroomStatus()).running).toBe(false)
  })

  it("reuses an external proxy already answering on the port and never kills it", async () => {
    const port = await freePort()
    process.env.HEADROOM_PORT = String(port)
    external = await startProxy({ bin: process.execPath, argsPrefix: [FAKE_HEADROOM, "proxy"], host: "127.0.0.1", port })
    const url = await ensureHeadroomProxy()
    expect(url).toBe(external.url)
    const status = await getHeadroomStatus()
    expect(status.running).toBe(true)
    expect(status.managed).toBe(false)
    await stopHeadroomProxy()
    expect((await getHeadroomStatus()).running).toBe(true)
  })

  it("moves to the next port when the first spawn exits early", async () => {
    const port = await freePort()
    process.env.HEADROOM_PORT = String(port)
    // Occupy the base port with a plain TCP listener (not a proxy): the fake
    // fails to bind and exits, so the service should retry on port + 1.
    const blocker = net.createServer()
    const sockets = new Set<net.Socket>()
    blocker.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)) })
    await new Promise<void>((r) => blocker.listen(port, "127.0.0.1", r))
    try {
      const url = await ensureHeadroomProxy()
      expect(url).toBe(`http://127.0.0.1:${port + 1}`)
    } finally {
      // The health probe's aborted socket stays half-open on the listener side;
      // destroy it or `close` never calls back.
      for (const s of sockets) s.destroy()
      await new Promise<void>((r) => blocker.close(() => r()))
    }
  })

  it("throws with the install hint when the CLI is missing and nothing runs on the port", async () => {
    _setHeadroomSpawnOverride(null)
    process.env.HEADROOM_PORT = String(await freePort())
    process.env.HEADROOM_BIN = path.join(os.tmpdir(), "definitely-not-headroom")
    process.env.PATH = os.tmpdir() // hide any real `headroom` from `which`
    await expect(ensureHeadroomProxy()).rejects.toThrow(/not installed|headroom/i)
    const status = await getHeadroomStatus()
    expect(status.running).toBe(false)
    expect(status.error).toMatch(/headroom/i)
  })

  it("getHeadroomAgentStats reads the running proxy's /stats and returns nulls for unknown agents", async () => {
    const port = await freePort()
    const statsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hx-headroom-")), "stats.json")
    fs.writeFileSync(statsFile, JSON.stringify(STATS_FIXTURE))
    process.env.HEADROOM_PORT = String(port)
    process.env.HUXFLUX_FAKE_HEADROOM_STATS = statsFile
    expect(await getHeadroomAgentStats("agent-a")).toEqual({ agent: null, proxy: null }) // nothing running yet
    await ensureHeadroomProxy()
    const stats = await getHeadroomAgentStats("agent-a")
    expect(stats.agent).toEqual({
      requests: 4, tokensSaved: 900, savingsPercent: 30, savingsUsd: 0.0123,
      inputTokens: 2100, lastActivityAt: "2026-09-09T10:00:00Z",
    })
    expect(stats.proxy).toEqual({ tokensSavedByCompression: 900, tokensLostToCacheBust: 50, cacheBustCount: 1, bustsAvoided: 7 })
    const other = await getHeadroomAgentStats("agent-b")
    expect(other.agent).toBeNull()
    expect(other.proxy?.cacheBustCount).toBe(1)
  })
})

describe("mapHeadroomAgentStats", () => {
  it("tolerates missing sections", () => {
    expect(mapHeadroomAgentStats({}, "x")).toEqual({ agent: null, proxy: null })
    expect(mapHeadroomAgentStats({ prefix_cache: {} }, "x")).toEqual({
      agent: null,
      proxy: { tokensSavedByCompression: null, tokensLostToCacheBust: null, cacheBustCount: null, bustsAvoided: null },
    })
    expect(mapHeadroomAgentStats("garbage", "x")).toEqual({ agent: null, proxy: null })
  })

  it("defaults missing numeric fields on a known project row to 0", () => {
    const out = mapHeadroomAgentStats({ savings: { per_project: { x: { requests: 2 } } } }, "x")
    expect(out.agent).toEqual({ requests: 2, tokensSaved: 0, savingsPercent: 0, savingsUsd: 0, inputTokens: 0, lastActivityAt: null })
  })
})

describe("buildHeadroomEnv", () => {
  it("sets base URL, tool search, and the project header from a clean env", () => {
    expect(buildHeadroomEnv("agent-1", "http://127.0.0.1:8787", {})).toEqual({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:8787",
      ENABLE_TOOL_SEARCH: "true",
      ANTHROPIC_CUSTOM_HEADERS: "X-Headroom-Project: agent-1",
    })
  })

  it("appends to existing custom headers and keeps an explicit ENABLE_TOOL_SEARCH", () => {
    const env = buildHeadroomEnv("agent-1", "http://127.0.0.1:8787", {
      ANTHROPIC_CUSTOM_HEADERS: "x-team: infra",
      ENABLE_TOOL_SEARCH: "false",
    })
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe("x-team: infra\nX-Headroom-Project: agent-1")
    expect(env.ENABLE_TOOL_SEARCH).toBe("false")
  })

  it("does not duplicate a user-supplied project header regardless of casing", () => {
    const env = buildHeadroomEnv("agent-1", "http://127.0.0.1:8787", {
      ANTHROPIC_CUSTOM_HEADERS: "x-headroom-project: mine\nx-other: 1",
    })
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe("x-headroom-project: mine\nx-other: 1")
  })
})
