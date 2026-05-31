#!/usr/bin/env node
// Verify the MIGRATIONS array in apps/server/src/db/index.ts has strictly
// increasing version numbers. The hand-rolled migration runner skips any
// migration whose version is <= the stored schema_version, so two entries
// with the same version means the second silently never runs.

import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const SELF = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SELF, "..")
const SOURCE = join(REPO_ROOT, "apps/server/src/db/index.ts")

function fail(msg) {
  console.error(`check-migrations: ${msg}`)
  process.exit(2)
}

const src = readFileSync(SOURCE, "utf8")

const startIdx = src.indexOf("const MIGRATIONS")
if (startIdx === -1) fail("could not find `const MIGRATIONS` in db/index.ts")

const afterStart = src.slice(startIdx)
// Find the array literal opener (after `= `), not the `[]` in the type annotation.
const equalsIdx = afterStart.indexOf("=")
if (equalsIdx === -1) fail("could not find `=` after MIGRATIONS declaration")
const arrayOpen = afterStart.indexOf("[", equalsIdx)
if (arrayOpen === -1) fail("could not find MIGRATIONS array literal")

// Find the matching closing bracket by depth counting.
let depth = 0
let arrayEnd = -1
for (let i = arrayOpen; i < afterStart.length; i++) {
  const ch = afterStart[i]
  if (ch === "[") depth++
  else if (ch === "]") {
    depth--
    if (depth === 0) { arrayEnd = i; break }
  }
}
if (arrayEnd === -1) fail("unterminated MIGRATIONS array")

const arrayBody = afterStart.slice(arrayOpen + 1, arrayEnd)
const versions = []
const versionRe = /version:\s*(\d+)/g
let m
while ((m = versionRe.exec(arrayBody)) !== null) {
  versions.push(Number(m[1]))
}

if (versions.length === 0) fail("no version entries found in MIGRATIONS")

const errors = []
let last = -Infinity
for (let i = 0; i < versions.length; i++) {
  const v = versions[i]
  if (v <= last) {
    errors.push(`migration #${i + 1}: version ${v} is not strictly greater than previous version ${last}`)
  }
  last = v
}

if (errors.length > 0) {
  console.error("check-migrations: MIGRATIONS versions must be strictly increasing")
  for (const e of errors) console.error(`  - ${e}`)
  console.error(
    "\nEach migration runs exactly once, tracked by schema_version. Duplicate or out-of-order versions silently skip."
  )
  process.exit(1)
}

console.log(`check-migrations: ok (${versions.length} migrations, latest v${last})`)
