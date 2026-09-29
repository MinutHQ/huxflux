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
