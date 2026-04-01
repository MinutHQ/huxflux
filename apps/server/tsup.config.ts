import { defineConfig } from "tsup"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("./package.json") as { version: string }

const sharedExternal = [
  // Node built-ins that must keep their node: prefix
  "node:sqlite",
  // All npm deps stay external (installed in node_modules alongside the package)
  /^@fastify/,
  /^fastify/,
  "dotenv",
  "drizzle-orm",
  "@octokit/rest",
  "simple-git",
  "uuid",
]

// Inject version at build time so --version never drifts from package.json
const define = { __PKG_VERSION__: JSON.stringify(pkg.version) }

export default defineConfig([
  // CLI — single bundled file; shebang injected automatically by tsup
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "node22",
    outDir: "dist",
    bundle: true,
    minify: true,
    external: sharedExternal,
    define,
    clean: false,
  },
  // Server entrypoint
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node22",
    outDir: "dist",
    bundle: true,
    minify: true,
    external: sharedExternal,
    define,
    clean: true,
  },
])
