#!/usr/bin/env node
// Fake Claude CLI used by the runner tests. Reads a JSON fixture from
// HUXFLUX_FAKE_FIXTURE (path), then emits each `events[]` entry as a JSON line
// on stdout with a small per-event delay so the runner's chunked-reader path
// gets exercised. Stderr lines come out next. Exits with `exitCode`.
//
// No npm dependencies — pure node so a freshly-cloned tree can run it.

import { readFileSync } from "node:fs"

const fixturePath = process.env.HUXFLUX_FAKE_FIXTURE
if (!fixturePath) {
  process.stderr.write("fake-claude: HUXFLUX_FAKE_FIXTURE env var is required\n")
  process.exit(2)
}

const delayMs = parseInt(process.env.HUXFLUX_FAKE_DELAY_MS ?? "5", 10)

let fixture
try {
  fixture = JSON.parse(readFileSync(fixturePath, "utf8"))
} catch (err) {
  process.stderr.write(`fake-claude: failed to read fixture: ${err.message}\n`)
  process.exit(2)
}

const events = Array.isArray(fixture.events) ? fixture.events : []
const stderrLines = Array.isArray(fixture.stderr) ? fixture.stderr : []
const exitCode = typeof fixture.exitCode === "number" ? fixture.exitCode : 0

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  for (const event of events) {
    if (typeof event === "string") {
      process.stdout.write(event + "\n")
    } else {
      process.stdout.write(JSON.stringify(event) + "\n")
    }
    if (delayMs > 0) await sleep(delayMs)
  }
  for (const line of stderrLines) {
    process.stderr.write(line + "\n")
  }
  process.exit(exitCode)
}

main().catch((err) => {
  process.stderr.write(`fake-claude: uncaught: ${err.message}\n`)
  process.exit(2)
})
