// Vitest setup file. Runs once per worker before any test module loads, so
// the production-side `config.dbPath` resolves to a throwaway directory and
// nothing in the suite ever touches the developer's real ~/huxflux state.

import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

if (!process.env.HUXFLUX_DIR) {
  const dir = mkdtempSync(join(tmpdir(), "huxflux-test-"))
  process.env.HUXFLUX_DIR = dir
}
// Force NODE_ENV=test so dev-only code paths (rolling backup, etc.) take the
// quiet branch in case future code keys off it.
process.env.NODE_ENV ??= "test"
// Disable the auth-token fallback so the runner's delegate fetch never asks
// for a token that doesn't exist.
process.env.AUTH_TOKEN ??= ""

// Discard `[db]` / `[runner]` / `[meta]` chatter at the worker level so
// passing test output stays scannable. Per-test `silenceLogs()` still works
// because it captures whatever console.log resolves to at call time. Failing
// tests still surface their actual errors through Vitest, which uses
// console.error via a separate path (we swallow that too only when
// silenceLogs() is invoked explicitly).
console.log = () => { /* discarded */ }
// Keep console.error and console.warn so unexpected failures stay visible.
