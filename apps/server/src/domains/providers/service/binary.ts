import { execFileSync } from "node:child_process"

/**
 * Factory for the per-provider binary discovery pattern.
 *
 * Every provider adapter resolves its CLI path the same way:
 *   1. Honor an env var override (e.g. `CLAUDE_BIN`).
 *   2. Otherwise probe `which <bin>` and trim.
 *   3. Fall back to the bare name (so the OS-level PATH still resolves it).
 * The result is cached in module scope until `reset()` is called (test seam).
 *
 * `isAvailable()` re-probes `which <bin>` and returns true on exit 0. Providers
 * that need a fallback probe (e.g. `npx claude-p --help` when `claude-p` isn't
 * on PATH) pass an `extraAvailabilityCheck` that runs only if the primary probe
 * fails.
 */
export interface BinaryResolver {
  resolve(): string
  isAvailable(): boolean
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
   * Optional second-chance availability probe. Used when the primary `which`
   * check fails but the binary might still be reachable via `npx` etc.
   */
  extraAvailabilityCheck?: () => boolean
}

export function createBinaryResolver(opts: BinaryResolverOptions): BinaryResolver {
  let cached: string | null = null

  function resolve(): string {
    if (cached) return cached
    const override = process.env[opts.envVar]
    if (override) { cached = override; return cached }
    try { cached = execFileSync("which", [opts.defaultBin], { encoding: "utf8" }).trim() }
    catch { cached = opts.fallbackBin ?? opts.defaultBin }
    return cached
  }

  function isAvailable(): boolean {
    try {
      execFileSync("which", [opts.defaultBin], { encoding: "utf8" })
      return true
    } catch {
      return opts.extraAvailabilityCheck?.() ?? false
    }
  }

  function reset(): void { cached = null }

  return { resolve, isAvailable, reset }
}
