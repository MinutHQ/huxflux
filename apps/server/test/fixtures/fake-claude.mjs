#!/usr/bin/env node
// Fake Claude CLI used by the runner tests. Reads a JSON fixture from
// HUXFLUX_FAKE_FIXTURE (path), then emits each `events[]` entry as a JSON line
// on stdout with a small per-event delay so the runner's chunked-reader path
// gets exercised. Stderr lines come out next, then one `env NAME=VALUE` line
// per name in the optional `echoEnv[]` (lets tests assert on the spawn env).
// With `reportStdin: true` the fake also watches its stdin and reports, on
// stderr, after how many emitted events the runner closed it
// (`stdin-ended-after=<n>` or `stdin-ended-after=never`).
// Exits with `exitCode`.
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
const echoEnv = Array.isArray(fixture.echoEnv) ? fixture.echoEnv : []
const reportStdin = fixture.reportStdin === true

let emitted = 0
let stdinEndedAfter = null
if (reportStdin) {
  process.stdin.on("end", () => { if (stdinEndedAfter === null) stdinEndedAfter = emitted })
  process.stdin.resume()
}

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
    emitted++
    if (delayMs > 0) await sleep(delayMs)
  }
  if (reportStdin) {
    // Give a close issued on the last event time to arrive before reporting.
    await sleep(50)
    process.stderr.write(`stdin-ended-after=${stdinEndedAfter ?? "never"}\n`)
  }
  for (const line of stderrLines) {
    process.stderr.write(line + "\n")
  }
  for (const name of echoEnv) {
    process.stderr.write(`env ${name}=${process.env[name] ?? ""}\n`)
  }
  process.exit(exitCode)
}

main().catch((err) => {
  process.stderr.write(`fake-claude: uncaught: ${err.message}\n`)
  process.exit(2)
})
