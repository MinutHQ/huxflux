import { spawn } from "node:child_process"
import { SERVER_VERSION } from "./version.js"
import { getSettings } from "./domains/settings/settings.service.js"
import { db } from "./db/index.js"
import { agents as agentsTable } from "./db/schema.js"
import { isNull } from "drizzle-orm"

const NPM_PACKAGE = "@minuthq/huxflux"
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

let latestVersion: string | null = null

function getNpmTag(): string {
  const settings = getSettings()
  return settings.updateChannel === "beta" ? "beta" : "latest"
}

export function getVersionInfo() {
  return {
    current: SERVER_VERSION,
    latest: latestVersion,
    updateAvailable: latestVersion ? isNewer(latestVersion, SERVER_VERSION) : false,
  }
}

function parseSemver(v: string): { major: number; minor: number; patch: number; pre: number } {
  const [base, preStr] = v.split("-beta.")
  const [major, minor, patch] = base.split(".").map(Number)
  return { major, minor, patch, pre: preStr ? Number(preStr) : Infinity }
}

function isNewer(a: string, b: string): boolean {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (pa.major !== pb.major) return pa.major > pb.major
  if (pa.minor !== pb.minor) return pa.minor > pb.minor
  if (pa.patch !== pb.patch) return pa.patch > pb.patch
  return pa.pre > pb.pre
}

export async function checkForUpdate(): Promise<{ current: string; latest: string | null; updateAvailable: boolean }> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const tag = getNpmTag()
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/${tag}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json() as { version: string }
      latestVersion = data.version
    }
  } catch {
    // Offline or registry down, keep previous value
  }
  return getVersionInfo()
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

// Exit code 42 tells the supervisor this is a planned restart (not a crash)
const UPDATE_EXIT_CODE = 42

export function triggerServerUpdate(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const tag = getNpmTag()
    const child = spawn("npm", ["install", "-g", `${NPM_PACKAGE}@${tag}`], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    })

    let stderr = ""
    child.stderr?.on("data", (d) => { stderr += d })

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true })
        // Give the response time to send before restarting
        setTimeout(() => process.exit(UPDATE_EXIT_CODE), 1000)
      } else {
        resolve({ success: false, error: stderr.trim() || `npm install failed (exit code ${code})` })
      }
    })
  })
}

// Periodic checker: runs every 6 hours, auto-updates if setting is on and idle
let checkInterval: ReturnType<typeof setInterval> | null = null

export function startUpdateChecker() {
  // Initial check after 30 seconds (let server boot first)
  setTimeout(() => {
    checkForUpdate().then((info) => {
      if (info.updateAvailable) {
        console.info(`[updater] Update available: ${info.current} → ${info.latest}`)
        maybeAutoUpdate()
      }
    })
  }, 30_000)

  checkInterval = setInterval(async () => {
    const info = await checkForUpdate()
    if (info.updateAvailable) {
      console.info(`[updater] Update available: ${info.current} → ${info.latest}`)
      maybeAutoUpdate()
    }
  }, CHECK_INTERVAL_MS)
}

async function maybeAutoUpdate() {
  const settings = getSettings()
  if (!settings.autoUpdateServer) return
  if (!isIdle()) {
    console.info("[updater] Auto-update deferred: agents are active")
    return
  }
  console.info("[updater] Auto-updating server...")
  const result = await triggerServerUpdate()
  if (!result.success) {
    console.error("[updater] Auto-update failed:", result.error)
  }
}

export function stopUpdateChecker() {
  if (checkInterval) clearInterval(checkInterval)
}
