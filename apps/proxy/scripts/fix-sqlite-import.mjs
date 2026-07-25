// tsup/esbuild strips the node: prefix from built-in imports.
// Node 25+ requires node:sqlite (bare 'sqlite' no longer works).
// This script patches the build output to restore the prefix.

import { readdirSync, readFileSync, writeFileSync } from "node:fs"

for (const file of readdirSync("dist")) {
  if (!file.endsWith(".js")) continue
  const path = `dist/${file}`
  const content = readFileSync(path, "utf8")
  if (content.includes('from"sqlite"')) {
    writeFileSync(path, content.replaceAll('from"sqlite"', 'from"node:sqlite"'))
    console.log(`[fix-sqlite] patched ${file}`)
  }
}
