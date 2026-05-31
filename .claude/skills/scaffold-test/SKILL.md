---
name: scaffold-test
description: Generate a Vitest test file collocated next to source under apps/server or packages/shared. Pulls in the standard harness, sets up the describe block, and leaves explicit TODO assertions so the next agent fills in real cases.
---

# scaffold-test

The user wants a Vitest test file scaffolded next to a source module. This skill produces a file that imports the standard harness, opens a `describe` block keyed to the module under test, and seeds it with empty test cases marked TODO. Tests are collocated (`foo.ts` plus `foo.test.ts`), never under a `__tests__/` directory, and never use snapshot assertions.

## Arguments

The user provides:
- The absolute (or repo-relative) path of the source file to test, e.g. `apps/server/src/domains/agent-runner/service/state.ts`

If the user gives only a domain name, ask which file. Do not guess.

## Target

Sibling to the source: `path/to/foo.ts` produces `path/to/foo.test.ts`. Refuse if the file already exists.

## What the file imports

Decide based on the source file's location:

### Server side (`apps/server/src/**`)

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createTestDb,
  captureWsEvents,
  silenceLogs,
  type TestDb,
  type CapturedWsEvents,
} from "../../../../../test/harness.js"
// Adjust the `../`-chain depth so it resolves to `apps/server/test/harness.ts`.
```

If the target does not touch the DB or WS layer, drop the unused imports. The harness only matters when the code reads from `db`, writes to it, or emits events via `agentsWs.*`.

### Shared package (`packages/shared/src/**`)

```ts
import { describe, expect, it } from "vitest"
```

`packages/shared` is pure logic — no DB, no spawn, no WS. Tests there assert on inputs and outputs directly.

## Template

```ts
import { describe, expect, it } from "vitest"
// import additional harness helpers above when the unit under test needs them.

import { /* the export(s) under test */ } from "./<module-basename>.js"

describe("<module-basename>", () => {
  it("TODO: describe the behavior being verified", () => {
    // TODO: arrange
    // TODO: act
    // TODO: assertion
    expect(true).toBe(true)
  })
})
```

When a DB is needed:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "../../../../../test/harness.js"

describe("<module>", () => {
  let testDb: TestDb
  beforeEach(() => { testDb = createTestDb() })
  afterEach(() => { testDb.close() })

  it("TODO: ...", () => {
    // TODO: assertion
    expect(true).toBe(true)
  })
})
```

## Rules

- One `describe` block keyed to the source module name. Add nested `describe`s for distinct scenarios as cases are filled in.
- No `toMatchSnapshot` or `toMatchInlineSnapshot`. Write explicit assertions even when verbose.
- Test names describe behavior, not implementation. "persists user message" beats "calls db.insert".
- Keep test files under 600 lines. Split into `<module>.<scenario>.test.ts` if a file grows large.
- Tests can `console.log` for fixture debugging (the lint rule is relaxed there), but do not commit log spam.

## Steps

1. Confirm the source path. Refuse if the `.test.ts` sibling already exists.
2. Decide harness-imports vs pure depending on the path.
3. Write the file with one `describe` block and one TODO `it`.
4. Report the file path and tell the user what to fill in.
5. Do not write production code. Do not edit other files (the skill only creates the test file).

## Do not

- Do not place tests under `__tests__/`. Always collocate.
- Do not generate snapshot assertions.
- Do not pre-populate the file with multiple `it` blocks copied from the source. The next agent fills in the real cases.
- Do not import internal modules outside the same domain. Tests in domain X may import from domain X freely; cross-domain test imports should come from the domain's index.
