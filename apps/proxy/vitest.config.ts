import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "proxy",
    environment: "node",
    // Each test file gets its own worker + its own in-memory SQLite handle.
    pool: "forks",
    globals: false,
    include: ["src/**/*.test.ts"],
    // The oauth DB module opens a SQLite handle at import; point it at memory
    // and pin a signing secret + allowed domain so tests are deterministic.
    env: {
      PROXY_DB_PATH: ":memory:",
      PROXY_JWT_SECRET: "test-signing-secret-do-not-use-in-prod",
      PROXY_ALLOWED_DOMAIN: "minut.com,example.com",
      PROXY_PUBLIC_URL: "https://proxy.test",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
    },
  },
})
