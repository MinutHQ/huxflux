// Workspace root. Each entry points at a per-package vitest.config.ts.
// Web, mobile, ui, and tokens are intentionally excluded for now: web/mobile/ui
// have no React test setup yet, and tokens is exports-only.
export default [
  "apps/server/vitest.config.ts",
  "packages/shared/vitest.config.ts",
]
