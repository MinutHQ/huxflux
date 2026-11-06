import * as fs from "node:fs"
import * as path from "node:path"

// What the generated service launcher (`huxflux-server.sh`) execs to start the
// supervisor. Node and the CLI script are named explicitly instead of going
// through the `huxflux` bin shim: the shim lives in npm's global bin dir, which
// is not always next to `process.execPath` (Homebrew puts node in the Cellar but
// npm bins in `<prefix>/bin`), and its `#!/usr/bin/env node` shebang would pick
// whatever Node is first on the login-shell PATH rather than the one huxflux was
// installed with.
export interface SupervisorCommand {
  nodeBin: string
  cliPath: string
}

// `<prefix>/Cellar/<formula>/<version>/<rest>`
const cellarPattern = /^(.*)\/Cellar\/([^/]+)\/[^/]+\/(.+)$/

function isSameFile(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b)
  } catch {
    return false
  }
}

// Homebrew resolves `process.execPath` to a version-pinned Cellar path that
// disappears on `brew upgrade`. `<prefix>/opt/<formula>` is Homebrew's stable
// symlink to the current keg and exists for keg-only formulae (node@22) too, so
// use it when it currently points at the same file. Anything else (nvm, volta,
// nodejs.org, or an opt link that already moved on) is returned unchanged.
function toStableHomebrewPath(filePath: string): string {
  const match = cellarPattern.exec(filePath)
  if (!match) return filePath
  const [, prefix = "", formula = "", rest = ""] = match
  const candidate = path.join(prefix, "opt", formula, rest)
  return isSameFile(candidate, filePath) ? candidate : filePath
}

export function resolveSupervisorCommand(execPath: string, cliPath: string): SupervisorCommand {
  return {
    nodeBin: toStableHomebrewPath(execPath),
    cliPath: toStableHomebrewPath(cliPath),
  }
}

export function buildSupervisorExecLine(cmd: SupervisorCommand): string {
  return `exec "${cmd.nodeBin}" "${cmd.cliPath}" _supervisor`
}
