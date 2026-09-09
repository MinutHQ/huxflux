#!/usr/bin/env node
// Fake `uv`/`pipx` for the headroom install tests. Prints a few progress lines
// (stdout + stderr), waits HUXFLUX_FAKE_INSTALL_DELAY_MS, exits with
// HUXFLUX_FAKE_INSTALL_EXIT (default 0). No npm dependencies.
const exitCode = parseInt(process.env.HUXFLUX_FAKE_INSTALL_EXIT ?? "0", 10)
const delayMs = parseInt(process.env.HUXFLUX_FAKE_INSTALL_DELAY_MS ?? "50", 10)
process.stdout.write(`Resolved 12 packages\n`)
process.stderr.write(`Downloading headroom-ai\n`)
setTimeout(() => {
  process.stdout.write(exitCode === 0 ? "Installed 1 executable: headroom\n" : "error: build failed\n")
  process.exit(exitCode)
}, delayMs)
