import { afterEach, describe, expect, it } from "vitest"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { freePort } from "../../../../test/harness.js"
import { isProxyHealthy, startProxy, ProxyStartError, type ManagedProxy } from "./proxyProcess.js"

const __filename = fileURLToPath(import.meta.url)
const SERVER_ROOT = path.resolve(path.dirname(__filename), "..", "..", "..", "..")
const FAKE_HEADROOM = path.join(SERVER_ROOT, "test", "fixtures", "fake-headroom.mjs")

function spec(port: number, env: Record<string, string> = {}) {
  return {
    bin: process.execPath,
    argsPrefix: [FAKE_HEADROOM, "proxy"],
    host: "127.0.0.1",
    port,
    extraArgs: ["--telemetry"],
    env: { ...process.env, ...env },
    healthTimeoutMs: 5_000,
  }
}

describe("startProxy", () => {
  let managed: ManagedProxy | null = null
  afterEach(async () => {
    await managed?.stop()
    managed = null
  })

  it("resolves with the URL once /health answers, even when the fake listens late", async () => {
    const port = await freePort()
    managed = await startProxy(spec(port, { HUXFLUX_FAKE_HEADROOM_DELAY_MS: "600" }))
    expect(managed.url).toBe(`http://127.0.0.1:${port}`)
    expect(managed.port).toBe(port)
    expect(await isProxyHealthy(managed.url)).toBe(true)
  })

  it("stop() kills the child and resolves exited", async () => {
    const port = await freePort()
    managed = await startProxy(spec(port))
    await managed.stop()
    await managed.exited
    expect(await isProxyHealthy(managed.url)).toBe(false)
    managed = null
  })

  it("rejects with reason 'exited' when the child dies before health", async () => {
    const port = await freePort()
    const err = await startProxy(spec(port, { HUXFLUX_FAKE_HEADROOM_EXIT: "1" })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProxyStartError)
    expect((err as ProxyStartError).reason).toBe("exited")
  })

  it("rejects with reason 'timeout' and kills the child when health never turns 200", async () => {
    const port = await freePort()
    const s = { ...spec(port, { HUXFLUX_FAKE_HEADROOM_NO_HEALTH: "1" }), healthTimeoutMs: 800 }
    const err = await startProxy(s).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProxyStartError)
    expect((err as ProxyStartError).reason).toBe("timeout")
    // The child was reaped: nothing answers on the port any more.
    await new Promise((r) => setTimeout(r, 300))
    expect(await isProxyHealthy(`http://127.0.0.1:${port}`)).toBe(false)
  })
})
