import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

// The server used to be published only to GitHub Packages, so the installer
// pinned the @minuthq scope to that registry in the user's ~/.npmrc, along with
// a personal access token. It is published to npmjs as well now, so the pin is
// what forces old installs to keep authenticating. Dropping it lets npm resolve
// the scope normally. A pin to any other registry (a corporate mirror, say) is
// deliberate and left untouched.
const GITHUB_PACKAGES_HOST = "npm.pkg.github.com"
const SCOPE_REGISTRY_KEY = "@minuthq:registry"

function isGithubPackagesPin(line: string): boolean {
  const separator = line.indexOf("=")
  if (separator === -1) return false
  if (line.slice(0, separator).trim() !== SCOPE_REGISTRY_KEY) return false
  return line.slice(separator + 1).includes(GITHUB_PACKAGES_HOST)
}

/**
 * npmrc content with every GitHub Packages pin for our scope removed, or null
 * when the content has none and does not need rewriting.
 */
export function withoutGithubPackagesPin(content: string): string | null {
  const lines = content.split("\n")
  const kept = lines.filter((line) => !isGithubPackagesPin(line))
  if (kept.length === lines.length) return null
  return kept.join("\n")
}

/** Best-effort: rewrite ~/.npmrc so installs of our scope resolve via npmjs. */
export function dropGithubPackagesPin(npmrcPath = path.join(os.homedir(), ".npmrc")): void {
  try {
    if (!fs.existsSync(npmrcPath)) return
    const updated = withoutGithubPackagesPin(fs.readFileSync(npmrcPath, "utf8"))
    if (updated === null) return
    // Write beside the target and rename into place. This file holds the user's
    // registry credentials, so a crash mid-write must not truncate it. Keeping
    // the original mode means the replacement is not more permissive.
    const tmp = `${npmrcPath}.huxflux-${process.pid}`
    try {
      fs.writeFileSync(tmp, updated, { mode: fs.statSync(npmrcPath).mode })
      fs.renameSync(tmp, npmrcPath)
    } catch (err) {
      try { fs.unlinkSync(tmp) } catch { /* nothing to clean up */ }
      throw err
    }
  } catch { /* best-effort */ }
}

/**
 * Environment for npm child processes, with the running Node's bin dir first on
 * PATH. The service PATH starts with the login shell's, so a bare `npm` can
 * belong to another Node install (a different nvm version, say). A global
 * install there succeeds but never replaces the package this server runs from.
 */
export function npmEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const key = Object.keys(base).find((k) => k.toUpperCase() === "PATH") ?? "PATH"
  const nodeBin = path.dirname(process.execPath)
  return { ...base, [key]: [nodeBin, base[key]].filter(Boolean).join(path.delimiter) }
}

interface ParsedVersion {
  core: [number, number, number]
  pre: string[] | null
}

function parseVersion(version: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(version.trim())
  if (!match) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".") : null,
  }
}

/** Semver precedence of two prerelease lists; a release (null) outranks any prerelease. */
function comparePrerelease(a: string[] | null, b: string[] | null): number {
  if (!a || !b) return a === b ? 0 : a ? -1 : 1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) > Number(y) ? 1 : -1
    } else if (xNumeric !== yNumeric) {
      return xNumeric ? -1 : 1
    } else if (x !== y) {
      return x > y ? 1 : -1
    }
  }
  return 0
}

/** True when `candidate` is a strictly newer semver than `current`. Unparseable input is never newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return (a.core[i] ?? 0) > (b.core[i] ?? 0)
  }
  return comparePrerelease(a.pre, b.pre) > 0
}
