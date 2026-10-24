// Semver precedence for update checks (server, desktop and mobile updaters).

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
