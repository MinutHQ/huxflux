import { defineConfig } from "tsup"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("./package.json") as { version: string }

// tsup/esbuild strips node: prefix from built-in imports.
// Node 25+ requires node:sqlite (bare 'sqlite' no longer works).
const fixNodeSqlite = "node scripts/fix-sqlite-import.mjs"

const sharedExternal = [
  // All npm deps stay external (installed in node_modules alongside the package)
  /^@fastify/,
  /^fastify/,
  "dotenv",
  /^drizzle-orm/,
  "@octokit/rest",
  "pino",
  "pino-pretty",
  "simple-git",
  "uuid",
  // pino (and thread-stream beneath it) does dynamic require() of node builtins
  // and worker threads; like pino-pretty it must not be bundled into ESM.
  "pino",
  // pino-pretty does dynamic require() of node builtins; bundling it into ESM
  // throws "Dynamic require of 'tty' is not supported" at load time. Keep it
  // external so it's loaded from node_modules (a working CJS package) in dev.
  // It's a devDependency, so prod installs simply won't have it → JSON logs,
  // which is the intended production behavior.
  "pino-pretty",
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
    onSuccess: fixNodeSqlite,
  },
])
