import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "shared",
    environment: "node",
    pool: "forks",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
})
