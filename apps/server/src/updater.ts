import { spawn, type SpawnOptions } from "node:child_process"
import { SERVER_VERSION } from "./version.js"
import { isNewerVersion } from "@huxflux/shared"
import { dropGithubPackagesPin, npmEnv } from "./npmRegistry.js"
import { getSettings } from "./domains/settings/settings.service.js"
import { db } from "./db/index.js"
import { agents as agentsTable } from "./db/schema.js"
import { isNull } from "drizzle-orm"
import { logger } from "./logger.js"
import { restartWhenIdle } from "./shutdown.js"

const NPM_PACKAGE = "@minuthq/huxflux"
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
const VIEW_TIMEOUT_MS = 15_000
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000
// npm is a .cmd shim on Windows and only resolves through a shell there.
// Elsewhere it is spawned directly so a timeout kills npm, not just a shell.
const SPAWN_SHELL = process.platform === "win32"
// Read by `huxflux _postinstall`: when the server installs its own update, the
// new version's postinstall must not stop the server (and, under launchd, the
// whole job including the npm install itself). The server restarts on its own.
const SELF_UPDATE_ENV = "HUXFLUX_SELF_UPDATE"

interface UpdateResult {
  success: boolean
  error?: string
}

let latestVersion: string | null = null
let installing: Promise<UpdateResult> | null = null
let lastUpdateError: string | null = null
// Set once an install succeeded. The restart can wait up to an hour for busy
// agents; until then the new version is on disk and must not install again.
let installedPendingRestart = false

function spawnNpm(args: string[], options: SpawnOptions) {
  // An args array with `shell: true` is deprecated (DEP0190), so the shell
  // gets a single command string. Our args never need quoting.
  return SPAWN_SHELL
    ? spawn(`npm ${args.join(" ")}`, { ...options, shell: true })
    : spawn("npm", args, options)
}

function getNpmTag(): string {
  const settings = getSettings()
  return settings.updateChannel === "beta" ? "beta" : "latest"
}

export function getVersionInfo() {
  return {
    current: SERVER_VERSION,
    latest: latestVersion,
    updateAvailable: !installedPendingRestart && latestVersion !== null && isNewerVersion(latestVersion, SERVER_VERSION),
    updateInProgress: installing !== null,
    updateError: lastUpdateError,
  }
}

export function checkForUpdate(): Promise<ReturnType<typeof getVersionInfo>> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawnNpm(["view", `${NPM_PACKAGE}@${getNpmTag()}`, "version"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: VIEW_TIMEOUT_MS,
        env: npmEnv(),
      })
    } catch (err) {
      logger.warn({ err }, "[updater] version check failed")
      resolve(getVersionInfo())
      return
    }
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (d) => { stdout += d })
    child.stderr?.on("data", (d) => { stderr += d })
    child.on("close", (code, signal) => {
      const version = stdout.trim()
      if (code === 0 && version) {
        latestVersion = version
      } else {
        logger.warn({ code, signal, err: stderr.trim().slice(-2000) }, "[updater] version check failed")
      }
      resolve(getVersionInfo())
    })
    child.on("error", (err) => {
      logger.warn({ err: err.message }, "[updater] version check failed")
      resolve(getVersionInfo())
    })
  })
}

function isIdle(): boolean {
  try {
    const active = db.select().from(agentsTable)
      .where(isNull(agentsTable.deletedAt))
      .all()
    return !active.some((a) => a.streaming || a.status === "in-progress")
  } catch {
    return true
  }
}

function runInstall(): Promise<UpdateResult> {
  return new Promise((resolve) => {
    let stderr = ""
    let settled = false

    function fail(error: string) {
      if (settled) return
      settled = true
      lastUpdateError = error
      resolve({ success: false, error })
    }

    lastUpdateError = null
    let child: ReturnType<typeof spawn>
    try {
      dropGithubPackagesPin()
      // stdout is ignored, not piped: an unread pipe fills up and blocks npm.
      // The timeout is generous on purpose: a killed global install can leave
      // the package half-replaced, so it only exists to unstick a hung npm.
      child = spawnNpm(["install", "-g", `${NPM_PACKAGE}@${getNpmTag()}`], {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: INSTALL_TIMEOUT_MS,
        env: { ...npmEnv(), [SELF_UPDATE_ENV]: "1" },
      })
    } catch (err) {
      fail(`Could not run npm: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    child.stderr?.on("data", (d) => { stderr += d })

    child.on("error", (err) => fail(`Could not run npm: ${err.message}`))
    child.on("close", (code, signal) => {
      if (code === 0) {
        if (settled) return
        settled = true
        installedPendingRestart = true
        resolve({ success: true })
        // Restart once running agent turns have finished so none of them is
        // cut mid-message.
        setTimeout(() => restartWhenIdle("the Huxflux server was updated"), 1000)
      } else if (signal) {
        fail(`npm install was stopped (${signal}); installs are cut off after ${INSTALL_TIMEOUT_MS / 60_000} minutes`)
      } else {
        fail(stderr.trim().slice(-2000) || `npm install failed (exit code ${code})`)
      }
    })
  })
}

/**
 * Install the latest version for the configured channel and restart once idle.
 * A call while an install is already running joins that install. Never rejects.
 */
export function triggerServerUpdate(): Promise<UpdateResult> {
  if (installedPendingRestart) return Promise.resolve({ success: true })
  if (!installing) {
    installing = runInstall().finally(() => { installing = null })
  }
  return installing
}

// Periodic checker: runs every 6 hours, auto-updates if setting is on and idle
let checkInterval: ReturnType<typeof setInterval> | null = null

export function startUpdateChecker() {
  // Migrate installs that still pin our scope to GitHub Packages, so both the
  // version check and the update itself work without a token from here on.
  dropGithubPackagesPin()

  // Initial check after 30 seconds (let server boot first)
  setTimeout(() => {
    checkForUpdate().then((info) => {
      if (info.updateAvailable) {
        logger.info(`[updater] Update available: ${info.current} → ${info.latest}`)
        maybeAutoUpdate()
      }
    })
  }, 30_000)

  checkInterval = setInterval(async () => {
    const info = await checkForUpdate()
    if (info.updateAvailable) {
      logger.info(`[updater] Update available: ${info.current} → ${info.latest}`)
      maybeAutoUpdate()
    }
  }, CHECK_INTERVAL_MS)
}

async function maybeAutoUpdate() {
  const settings = getSettings()
  if (!settings.autoUpdateServer) return
  if (!isIdle()) {
    logger.info("[updater] Auto-update deferred: agents are active")
    return
  }
  logger.info("[updater] Auto-updating server...")
  const result = await triggerServerUpdate()
  if (!result.success) {
    logger.error({ err: result.error }, "[updater] Auto-update failed")
  }
}

export function stopUpdateChecker() {
  if (checkInterval) clearInterval(checkInterval)
}
