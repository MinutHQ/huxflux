import { describe, expect, it } from "vitest"
import type { ServerVersionInfo } from "./settings.types.js"
import { waitForServerUpdate } from "./waitForServerUpdate.js"

function info(overrides: Partial<ServerVersionInfo> = {}): ServerVersionInfo {
  return { current: "0.3.5", latest: "0.3.6", updateAvailable: true, ...overrides }
}

function sequence(...steps: (ServerVersionInfo | Error)[]): () => Promise<ServerVersionInfo> {
  let i = 0
  return async () => {
    const step = steps[Math.min(i++, steps.length - 1)]
    if (step === undefined) throw new Error("empty sequence")
    if (step instanceof Error) throw step
    return step
  }
}

describe("waitForServerUpdate", () => {
  it("reports installed once the install finishes without an error", async () => {
    const getVersion = sequence(info({ updateInProgress: true }), info({ updateInProgress: false, updateError: null }))
    expect(await waitForServerUpdate(getVersion, { intervalMs: 1 })).toEqual({ status: "installed" })
  })

  it("reports the server's error when the install fails", async () => {
    const getVersion = sequence(info({ updateInProgress: true }), info({ updateInProgress: false, updateError: "EACCES" }))
    expect(await waitForServerUpdate(getVersion, { intervalMs: 1 })).toEqual({ status: "failed", error: "EACCES" })
  })

  it("keeps polling through a restart until the server answers", async () => {
    const getVersion = sequence(info({ updateInProgress: true }), new Error("fetch failed"), info({ current: "0.3.6", updateAvailable: false }))
    expect(await waitForServerUpdate(getVersion, { intervalMs: 1 })).toEqual({ status: "installed" })
  })

  it("reports an install error seen after a dropped poll", async () => {
    const getVersion = sequence(new Error("fetch failed"), info({ updateInProgress: false, updateError: "EACCES" }))
    expect(await waitForServerUpdate(getVersion, { intervalMs: 1 })).toEqual({ status: "failed", error: "EACCES" })
  })

  it("fails when the server never comes back", async () => {
    const outcome = await waitForServerUpdate(sequence(new Error("fetch failed")), { intervalMs: 1, timeoutMs: 5 })
    expect(outcome).toEqual({ status: "failed", error: "Lost contact with the server during the update" })
  })

  it("returns at once for a server that does not report progress", async () => {
    expect(await waitForServerUpdate(sequence(info()), { intervalMs: 1 })).toEqual({ status: "installed" })
  })

  it("gives up after the timeout", async () => {
    const outcome = await waitForServerUpdate(sequence(info({ updateInProgress: true })), { intervalMs: 1, timeoutMs: 5 })
    expect(outcome.status).toBe("failed")
  })
})
