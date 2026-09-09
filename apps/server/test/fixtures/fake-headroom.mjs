#!/usr/bin/env node
// Fake `headroom proxy` used by the headroom domain tests. Accepts the same
// CLI shape (`proxy --host H --port P [--telemetry]`), serves GET /health with
// 200 and GET /stats with the JSON file named by HUXFLUX_FAKE_HEADROOM_STATS
// (or `{}`). Env knobs:
//   HUXFLUX_FAKE_HEADROOM_DELAY_MS   wait before listening (health-poll path)
//   HUXFLUX_FAKE_HEADROOM_NO_HEALTH  "1" = listen but answer /health with 503
//   HUXFLUX_FAKE_HEADROOM_EXIT       "1" = exit(3) immediately (port-taken path)
// No npm dependencies.

import { createServer } from "node:http"
import { readFileSync } from "node:fs"

if (process.env.HUXFLUX_FAKE_HEADROOM_EXIT === "1") {
  process.stderr.write("fake-headroom: refusing to start\n")
  process.exit(3)
}

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback
}
const host = flag("--host", "127.0.0.1")
const port = parseInt(flag("--port", "8787"), 10)
const delayMs = parseInt(process.env.HUXFLUX_FAKE_HEADROOM_DELAY_MS ?? "0", 10)
const noHealth = process.env.HUXFLUX_FAKE_HEADROOM_NO_HEALTH === "1"

function statsBody() {
  const file = process.env.HUXFLUX_FAKE_HEADROOM_STATS
  if (!file) return "{}"
  try { return readFileSync(file, "utf8") } catch { return "{}" }
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(noHealth ? 503 : 200, { "content-type": "application/json" })
    res.end(JSON.stringify({ status: noHealth ? "starting" : "ok" }))
    return
  }
  if (req.url?.startsWith("/stats")) {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(statsBody())
    return
  }
  res.writeHead(404)
  res.end()
})

server.on("error", (err) => {
  process.stderr.write(`fake-headroom: ${err.message}\n`)
  process.exit(3)
})

setTimeout(() => {
  server.listen(port, host, () => {
    process.stdout.write(`fake-headroom listening on ${host}:${port}\n`)
  })
}, delayMs)

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => { server.close(); process.exit(0) })
}
