import { defineConfig } from "tsup"

// Single bundled server entrypoint. `ws` stays external (it does optional
// native-addon requires for bufferutil/utf-8-validate that must not be bundled)
// and is installed from node_modules alongside the built file. `@huxflux/shared`
// is bundled in — only its tiny proxy protocol subpath is imported, so no React
// graph comes along.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  bundle: true,
  minify: true,
  clean: true,
  external: ["ws"],
  // esbuild strips the node: prefix; Node 25+ needs node:sqlite. Restore it.
  onSuccess: "node scripts/fix-sqlite-import.mjs",
})
