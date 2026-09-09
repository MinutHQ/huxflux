import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { silenceLogs, waitFor, type SilencedLogs } from "../../../../test/harness.js"
import { _resetInstallState, _setInstallerOverride, detectInstaller, getInstallState, startInstall } from "./install.js"

const __filename = fileURLToPath(import.meta.url)
const SERVER_ROOT = path.resolve(path.dirname(__filename), "..", "..", "..", "..")
const FAKE_INSTALLER = path.join(SERVER_ROOT, "test", "fixtures", "fake-installer.mjs")

describe("headroom install", () => {
  let logs: SilencedLogs
  let savedEnv: NodeJS.ProcessEnv
  beforeEach(() => {
    logs = silenceLogs()
    savedEnv = { ...process.env }
    _setInstallerOverride({ name: "fake", bin: process.execPath, args: [FAKE_INSTALLER] })
  })
  afterEach(() => {
    _resetInstallState()
    _setInstallerOverride(null)
    process.env = savedEnv
    logs.restore()
  })

  it("runs the installer, tails its output, and reports success", async () => {
    const done: boolean[] = []
    const started = await startInstall((ok) => done.push(ok))
    expect(started.state).toBe("running")
    expect(started.installer).toBe("fake")
    expect(started.command).toContain(FAKE_INSTALLER)
    await waitFor(() => getInstallState().state === "succeeded")
    expect(done).toEqual([true])
    const final = getInstallState()
    expect(final.error).toBeNull()
    expect(final.log).toContain("Resolved 12 packages")
    expect(final.log).toContain("Downloading headroom-ai")
    expect(final.log).toContain("Installed 1 executable: headroom")
  })

  it("reports failure with the exit code and last log line", async () => {
    process.env.HUXFLUX_FAKE_INSTALL_EXIT = "2"
    const done: boolean[] = []
    await startInstall((ok) => done.push(ok))
    await waitFor(() => getInstallState().state === "failed")
    expect(done).toEqual([false])
    expect(getInstallState().error).toMatch(/code 2/)
    expect(getInstallState().error).toMatch(/build failed/)
  })

  it("ignores a second start while one is running", async () => {
    process.env.HUXFLUX_FAKE_INSTALL_DELAY_MS = "400"
    const first = await startInstall(() => {})
    const second = await startInstall(() => { throw new Error("second callback must not fire") })
    expect(first.state).toBe("running")
    expect(second.state).toBe("running")
    await waitFor(() => getInstallState().state === "succeeded")
  })

  it("fails cleanly when no installer is on PATH", async () => {
    _setInstallerOverride(null)
    process.env.PATH = os.tmpdir()
    process.env.HOME = os.tmpdir()
    expect(await detectInstaller()).toBeNull()
    const result = await startInstall(() => { throw new Error("must not fire") })
    expect(result.state).toBe("failed")
    expect(result.error).toMatch(/uv|pipx/)
  })
})
