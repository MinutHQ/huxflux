// eslint-disable-next-line no-restricted-imports -- cached one-shot: resolve() and isAvailable() cold path run once then cache
import { execFile, execFileSync } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * Factory for the per-provider binary discovery pattern.
 *
 * Every provider adapter resolves its CLI path the same way:
 *   1. Honor an env var override (e.g. `CLAUDE_BIN`).
 *   2. Otherwise probe `which <bin>` and trim.
 *   3. Fall back to the bare name (so the OS-level PATH still resolves it).
 * The result is cached in module scope until `reset()` is called (test seam).
 *
 * `isAvailable()` is **synchronous** and returns the cached availability
 * answer in O(1) — it never spawns a slow probe inline. The actual probe
 * (`which <bin>`, plus an optional async fallback like `npx claude-p --help`)
 * runs in `warmAvailability()`, which the server calls at startup. Before
 * the warm completes we optimistically report `true` for providers that have
 * a fallback configured; without a fallback, the answer is whatever the
 * single fast `which` probe returns.
 *
 * Why the split: the previous design ran the fallback probe inside the
 * synchronous `isAvailable()` from request handlers. `npx claude-p --help`
 * downloads the package on first use, which blocked Node's event loop for
 * 30+ seconds and froze every other HTTP/WS request the server was serving.
 */
export interface BinaryResolver {
  resolve(): string
  isAvailable(): boolean
  warmAvailability(): Promise<void>
  reset(): void
}

export interface BinaryResolverOptions {
  /** Bare name probed via `which`. */
  defaultBin: string
  /** Env var that, when set, short-circuits discovery to its value. */
  envVar: string
  /**
   * Path returned when `which <defaultBin>` fails. Defaults to `defaultBin` so
   * the OS-level PATH still gets a chance at spawn time. Set this to an
   * alternate launcher (e.g. `"npx"`) when the CLI may be reachable via a
   * second mechanism.
   */
  fallbackBin?: string
  /**
   * Optional second-chance availability probe. Runs only inside
   * `warmAvailability()` (never inline from `isAvailable()`). Must be async
   * so it doesn't block the event loop — use `execFile` from
   * `node:child_process`, promisified, not `execFileSync`.
   */
  extraAvailabilityCheck?: () => Promise<boolean>
}

export function createBinaryResolver(opts: BinaryResolverOptions): BinaryResolver {
  let cached: string | null = null
  // `availabilityCached === null` means "warm hasn't completed yet"; treat
  // that as optimistically available when a fallback is configured.
  let availabilityCached: boolean | null = null
  let warmPromise: Promise<void> | null = null

  function resolve(): string {
    if (cached) return cached
    const override = process.env[opts.envVar]
    if (override) { cached = override; return cached }
    try { cached = execFileSync("which", [opts.defaultBin], { encoding: "utf8" }).trim() }
    catch { cached = opts.fallbackBin ?? opts.defaultBin }
    return cached
  }

  function isAvailable(): boolean {
    if (availabilityCached !== null) return availabilityCached
    // Pre-warm: optimistic when a fallback exists, otherwise rely on the
    // fast `which` probe.
    if (opts.extraAvailabilityCheck) return true
    try {
      execFileSync("which", [opts.defaultBin], { encoding: "utf8" })
      return true
    } catch {
      return false
    }
  }

  function warmAvailability(): Promise<void> {
    if (warmPromise) return warmPromise
    warmPromise = (async () => {
      try {
        await execFileAsync("which", [opts.defaultBin], { encoding: "utf8" })
        availabilityCached = true
        return
      } catch { /* fall through to extra check */ }
      if (!opts.extraAvailabilityCheck) {
        availabilityCached = false
        return
      }
      try {
        availabilityCached = await opts.extraAvailabilityCheck()
      } catch {
        availabilityCached = false
      }
    })()
    return warmPromise
  }

  function reset(): void {
    cached = null
    availabilityCached = null
    warmPromise = null
  }

  return { resolve, isAvailable, warmAvailability, reset }
}
