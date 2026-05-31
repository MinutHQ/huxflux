import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "server",
    environment: "node",
    // `forks` keeps every test file in its own worker. Required because the
    // runner tests swap the module-level `db` singleton and spawn child
    // processes; sharing a worker across files would let state leak.
    pool: "forks",
    globals: false,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Boot a clean HUXFLUX_DIR for the production-side `config.dbPath` and
    // silence chatty pino / [runner] logs before any module under test loads.
    setupFiles: ["./test/setup.ts"],
    // The harness boots node:sqlite, runs migrations, and writes to /tmp.
    // Bump the per-test default so the runAgent E2E (which spawns a child
    // process and waits for it to exit) has headroom.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
