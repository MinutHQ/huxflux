#!/usr/bin/env node
// Verify every domains/<name>/ directory has README.md.
// Walked locations: apps/web/src, apps/server/src, apps/mobile, packages/shared/src.
// Add roots here if new platforms adopt the domains/ pattern.
//
// Per-domain `index.ts` barrels were retired. The public surface of a domain
// is now the set of its top-level `.ts`/`.tsx` files; subfolders are private.
// README.md remains the human-maintained contract describing that surface.

import { readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const SELF = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SELF, '..')

const DOMAIN_ROOTS = [
  'apps/web/src/domains',
  'apps/server/src/domains',
  'apps/mobile/domains',
  'packages/shared/src/domains',
]

async function listDirs(path) {
  if (!existsSync(path)) return []
  const entries = await readdir(path, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

async function checkDomain(rootRel, name) {
  const errors = []
  const dir = join(REPO_ROOT, rootRel, name)
  const readme = join(dir, 'README.md')

  if (!existsSync(readme)) {
    errors.push(`${relative(REPO_ROOT, readme)} is missing`)
  }

  // Also descend into sub-domains/ if present (one level allowed).
  const subRoot = join(dir, 'sub-domains')
  if (existsSync(subRoot)) {
    const subStat = await stat(subRoot)
    if (subStat.isDirectory()) {
      const subs = await listDirs(subRoot)
      for (const sub of subs) {
        const subDir = join(subRoot, sub)
        if (!existsSync(join(subDir, 'README.md'))) {
          errors.push(`${relative(REPO_ROOT, join(subDir, 'README.md'))} is missing`)
        }
      }
    }
  }

  return errors
}

async function main() {
  const allErrors = []
  let checked = 0

  for (const root of DOMAIN_ROOTS) {
    const fullRoot = join(REPO_ROOT, root)
    const names = await listDirs(fullRoot)
    for (const name of names) {
      checked++
      const errors = await checkDomain(root, name)
      allErrors.push(...errors)
    }
  }

  if (allErrors.length > 0) {
    console.error('check-domains: missing required files')
    for (const e of allErrors) console.error(`  - ${e}`)
    console.error(
      '\nEvery domains/<name>/ directory must contain README.md.',
    )
    console.error('See root CLAUDE.md "The domains/ Pattern" section.')
    process.exit(1)
  }

  console.log(`check-domains: ok (${checked} domain${checked === 1 ? '' : 's'} checked)`)
}

main().catch((err) => {
  console.error('check-domains: fatal error', err)
  process.exit(2)
})
