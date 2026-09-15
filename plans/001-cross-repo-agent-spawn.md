# 001 — Cross-repo agent spawning: make `agents.spawn` (thread agents) first-class

## Context (verified against the codebase)

The user wants to be able to tell one agent to work on a task in a **different repo**.
This capability **already exists in this codebase** — it is the "thread agent" feature —
but it is (a) disabled by default and (b) riddled with reliability gaps that make it feel
like it "only works in the same repo":

Verified current state:

- **The REST layer already supports cross-repo creation.** `POST /api/agents` accepts
  `repoId` (`apps/server/src/domains/agents/routes/agents.create.routes.ts:28-45`,
  schema `createAgentBodySchema` in `@huxflux/shared`). So **no schema/migration work is
  needed** — `threadParentId`/`forkParentId` columns already exist
  (`apps/server/src/domains/agents/agents.db.ts:32-33`).
- **The agent-facing tag exists**: `<huxflux:agents.spawn repo="repo-name">task</...>`
  handled by `agentSpawnHandler` / `spawnThreadAgent`
  (`apps/server/src/domains/agents/service/runnerTags.ts:102-190`).
- **It is gated off by default**: `threadsEnabled` default is `false`
  (`packages/shared/src/domains/settings/settings.schema.ts:205-211`,
  section `"experimental"`). Consequences, both verified:
  - `tagInstructions.ts:173` — when disabled, `buildThreadDirective` returns `[]`, so the
    spawn tag is **never advertised in the agent's system prompt**;
  - `runnerTags.ts:114` — when disabled, `onTag` silently returns (tag stripped, **no
    feedback to the agent**).
- **Web UI already renders thread children** (`apps/web/src/domains/agents/hooks/useAgentGroups.ts:19-22`,
  nested in `StatusGroup`/`PinnedGroup`), and settings has the toggle
  (`apps/web/src/domains/settings/sections/ExperimentalSettings.tsx:15,51`).
- Lifecycle is mostly there too: `retireThreadChildren`
  (`apps/server/src/domains/agents/routes/agents.update.routes.ts:147-160`) retires thread
  children when the parent reaches a terminal status; `chatRun.ts:70` threads
  `threadParentId` into the tag instructions.

**Real gaps in `spawnThreadAgent`** (all verified in `service/runnerTags.ts` unless noted):

1. Failures are silent: every failure path returns `null` and `agentSpawnHandler` returns
   `undefined` — the tag is stripped and the LLM never learns why. (Compare: `pr.reply`
   instructions explicitly tell the agent to fall back to `gh` on failure.)
2. `repo` is matched by *name only* (`r.name === repoName || r.name.endsWith(\/${repoName})`);
   no way to address a repo by id.
3. Folder repos are not rejected: `createWorktree` on a non-git "folder" repo throws;
   `forkAgent` rejects `repo.type === "folder"` (line ~290) but spawn doesn't.
4. Branch `thread-${slug}` (slug derived from the task text) can collide between two thread
   agents spawned from similar task descriptions → `createWorktree` fails. `forkAgent`
   already solves this with an id suffix: `fork-${slug}-${id.slice(0,6)}`.
5. Duplicated setup-script runner: local silent `runSetupScript` (with `stdio: "ignore"`)
   duplicates `service/setupScript.ts`, which streams output to `terminalLines` + WS and
   rejects on nonzero exit. The create route uses the service version.
6. `sendInitialMessage` is fire-and-forget `fetch` to `POST /api/agents/:id/messages`
   (`.catch` swallows the error): if the request fails, the spawned agent exists but **its
   task description is lost**.
7. Missing pieces the create route does but spawn doesn't: live file watcher
   (`watchWorktree`, create route `agents.create.routes.ts:75-81`) and the default `t1`
   terminal tab (create route lines 83-89).
8. Model/provider: thread agent always uses `settings.defaultModel`/`defaultProvider`,
   ignoring the parent's model/provider.

## Plan goals

Make "tell an agent to work on a task in a different repo" work **out of the box**: the
spawn tag is advertised and functional by default, every failure is reported back to the
agent, and the spawned thread agent gets the same full treatment the REST create path gives
an agent (setup script streaming, watcher, terminal tab, seeded first message that actually
delivers).

## Out of scope

- No DB migrations (all columns exist).
- No web/mobile/desktop UI changes — the toggle and thread-child rendering already exist.
- No changes to the `fork`, `delegate`, `branch`, `title` tag handlers.
- Reserve-pool (`git/pool.ts` `claimReserve`) reuse for thread agents — the cold
  `createWorktree` path stays (thread agents are rare; not worth the complexity).
- No new spawn options (`noWorktree`, `existingBranch`, `from=`) — thread agents always get
  their own fresh worktree branched from the target repo's `branchFrom`.
- Delegation authorization (any agent may delegate to any agent today; keep it).
- No changes to `agent-runner` other than what flows through existing `TagHandler`/`followUp`
  machinery.

---

## Changes

### Step 1 — Default `threadsEnabled` to `true`

- `packages/shared/src/domains/settings/settings.schema.ts:207`:
  ```ts
  threadsEnabled: {
    type: "boolean",
    default: false,          // → true
    section: "experimental", // keep the section: the web toggle stays, so users can opt out
    ...
  }
  ```
- `packages/shared/src/domains/settings/settings.schema.test.ts:29-31`:
  ```ts
  it("ships threadsEnabled as a boolean false by default", () => {
    expect(settingsDefaults.threadsEnabled).toBe(false)   // → .toBe(true), rename test
  ```
- The web `ExperimentalSettings.tsx` reads the *server* value and sends
  `api.settings.update({ threadsEnabled: v })` — it keeps working unchanged; existing
  installations retain whatever value they saved (this only changes the default for new
  installs / unset settings).
- Update the `description` string if wording needs to reflect "on by default" — cosmetic,
  keep it accurate.

### Step 2 — Harden `spawnThreadAgent` + `agentSpawnHandler`
(`apps/server/src/domains/agents/service/runnerTags.ts`)

Rewrite `spawnThreadAgent` (lines 133-190) along these lines (keep the existing shape —
it returns `{ id, title } | null`, which the handler turns into a `followUp`):

1. **Repo resolution**: tag args schema `z.object({ repo: z.string().min(1) })` →
   add optional `repoId: z.string().min(1).optional()`. Resolve: `repoId` exact match
   first, else name match (`r.name === repoName || r.name.endsWith(`/${repoName}`)`) —
   same two existing name rules. (`tagParser.ts:117 parseAttrs` already supports multiple
   attributes, and `dispatchTags` validates against the args schema, so this is safe.)
2. **Reject folder repos**: `if (repo.type === "folder") return { error: "..." }`
   (mirror `forkAgent`'s existing check).
3. **Check repo path exists**: `existsSync(repo.path)` check like
   `setupRepoWorktree` in the create route (do NOT delete anything — no row inserted yet).
4. **All failures return a reason** (e.g. `{ id, title } | { error: string }` or return
   the error string — pick one convention and use it everywhere in this file):
   unknown repo, folder repo, missing path, `createWorktree` throw, setup-script failure.
5. **Branch collision-proof**: `thread-${slug}-${id.slice(0,6)}` with the `branchPrefix`
   (mirror `forkAgent`'s `fork-${slug || "unnamed"}-${id.slice(0,6)}` pattern).
6. **Setup script**: delete the local silent `runSetupScript` + `RepoForSetup` interface;
   call `runSetupScript(repo.setupScript, worktreePath, id, repo.path)` from
   `service/setupScript.ts` (note: it *rejects* on nonzero exit — wrap in try/catch and
   treat failure as a spawn error, matching `setupRepoWorktree`'s behavior where the
   create route returns an error status).
7. **Seed the first message without the fire-and-forget fetch**: replace
   `sendInitialMessage`'s `fetch` with direct in-process calls —
   `enqueue(id, { content, worktreePath, model, planMode, sender, delegateFrom, provider,
   effort })` + `drainQueue(id)` (both exported from `service/messageQueue.ts`;
   `drainQueue` kicks off `runAgent` with `buildChatRunOptions`, which re-reads the freshly
   inserted agent row — so `repoId`/`threadParentId` flow through correctly and the spawned
   agent starts its first turn immediately). Keep the `sender: parentAgent.title` and
   `delegateFrom: parentAgentId` fields so the child's context matches today's behavior.
8. **Watcher + terminal tab** (parity with create route):
   `watchWorktree(id, worktreePath, repo.branchFrom)` and
   `db.insert(terminalTabs).values({ id: uuid(), agentId: id, terminalId: "t1",
   label: null, orderIdx: 0 })`.
9. **Inherit model/provider from parent**:
   `model: parentAgent.model ?? settings.defaultModel ?? "Sonnet 4.6"`,
   `provider: parentAgent.provider ?? (settings.defaultProvider ?? "claude")`.
10. `db.insert(agentsTable).values({...})` gains nothing new (threadParentId, repoId,
    branch, location, status, timestamps already present).

`agentSpawnHandler` (lines 102-131) changes:

- `if (!getSettings().threadsEnabled) return` →
  `return { followUp: { content: "Cross-repo threads are disabled in settings...", sender: "system" } }`.
- On `{ error }` from `spawnThreadAgent` → `return { followUp: { content:
  `Thread agent spawn failed: ${error}`, sender: "system" } }`. The runner's existing
  machinery delivers it: `tagParser.ts:95` gets the handler result;
  `finalize.ts:57,63,133-139` collects and POSTs followUps to the parent's own
  `/api/agents/:id/messages`, so the parent agent (and user) sees the failure as a
  "system" message at end of turn.
- Success followUp text: extend the existing block to mention that the new agent will
  start working immediately (the seeded message now reliably triggers a turn).
- Update the JSDoc on both functions to match.

### Step 3 — Tag instructions (`service/tagInstructions.ts`)

- `buildThreadDirective` (lines ~173-188): still gated on `threadsEnabled` (fine — with the
  new default it's on by default), but update the wording:
  - mention both address forms: `repo="repo-name"` or `repoId="..."`;
  - mention the seeded-first-message / immediate-start behavior;
  - keep the `Available repos: ...` list (names).
- `buildDelegateDirective` for thread agents (lines 133-138) already exists — leave it.
- `chatRun.ts:62-66` (`availableRepos = allRepos.map((r) => r.name)`) — leave as-is;
  name is what the instructions advertise.

### Step 4 — READMEs (CLAUDE.md requires keeping domain READMEs current)

- `apps/server/src/domains/agents/README.md`: add thread-agent/spawn to the "Owns" bullet
  for the REST surface or as a new bullet; add a "Quirks" entry covering: threadsEnabled
  gating + its new default, failure-followUp behavior, branch suffix, retire-on-parent-
  terminal (already partly documented — extend, don't duplicate).
- `packages/shared` settings README (if it documents defaults): flip the threadsEnabled
  default mention.
- `apps/server/src/domains/agents/service/` — check `setupScript.ts` header comment: no
  change needed (the runnerTags local copy is being deleted, service keeps the
  implementation).

### Step 5 — Tests (colocated, explicit assertions, harness — per CLAUDE.md)

New `apps/server/src/domains/agents/service/runnerTags.test.ts` using the existing harness
(`apps/server/test/harness.ts`: `createTestDb`, `createGitTmpRepo()`, `captureWsEvents`,
`silenceLogs`; real git, real DB — no stubbing). Two tmp repos (A = parent, B = target)
plus one folder-type repo row. Cases:

- **Cross-repo spawn (name)**: parent agent in repo A emits a spawn tag naming repo B →
  assertions: new agent row (repoId = B.id, `threadParentId` = parent id, branch
  `thread-<slug>-<id6>`), worktree exists on disk under `repo.workspacesPath`, t1 terminal
  tab row, `messages`/queue contains the seeded context (context mentions parent title,
  delegate instructions), WS `agent:updated` captured.
- **Cross-repo spawn (repoId attr)**: same, addressed by id.
- **Unknown repo**: `onTag` returns the error followUp; **no** agent row inserted.
- **Folder repo**: rejected with followUp; no worktree attempt.
- **threadsEnabled = false**: `onTag` returns the "disabled" followUp; no row.
- **Branch uniqueness**: two spawns with identical task text → distinct branches, both
  worktrees created (collision-proof regression test).
- **Setup script**: repo with `setupScript` → terminal-line rows captured (service version
  streams them); failing script (nonzero exit) → error followUp, no agent row.
- **First message reliably queued**: after a successful spawn, `drainQueue` path — assert
  the queue/runner actually receives the message (e.g. via `captureWsEvents` `message:*`
  events or the messages table, depending on what the harness lets a queued first turn
  produce — verify against `messageQueue.drainQueue` behavior when writing the test).

`packages/shared/.../settings.schema.test.ts`: default-flip assertions (already covered).
`service/tagInstructions.test.ts`: add cases — `buildChatTagInstructions` with
`threadsEnabled: true` contains the spawn tag + `Available repos:`; with `false` it does
not; wording mentions `repoId` form. (Read the current test's `baseArgs` shape first —
`buildChatTagInstructions` takes the `BuildArgs` interface, so these are input-arg tests,
independent of the settings service.)

Do NOT add tests for web/desktop/mobile UI (CLAUDE.md prohibition), and no tests for thin
routes.

### Step 6 — Cleanup

- Delete the now-unused local `runSetupScript`/`RepoForSetup` from `runnerTags.ts` and the
  `sendInitialMessage` fetch helper (replaced by step 2.6/2.7). Grep for other consumers
  of anything deleted first (`grep -rn runSetupScript apps/server/src`).
- Check `apps/desktop` and `apps/mobile` do not reference the deleted helpers (they wrap
  web; expected clean).

## Verify (run in this order; all must pass)

```bash
pnpm typecheck
pnpm build
pnpm lint            # eslint + check-domains + check-migrations
pnpm test apps/server/src/domains/agents packages/shared/src/domains/settings
# (gate-test style: only the touched paths; re-run after any fix)
```

Optional manual smoke: start the server with a fresh profile (threadsEnabled default true),
create two repos, start an agent in repo A, send it
`<huxflux:agents.spawn repo="B-name">do the thing</huxflux:agents.spawn>`, and confirm:
the system-prompt of the turn contains the spawn instructions; the reply contains the
"spawned" followUp; the new agent appears nested under the parent in the web sidebar;
its worktree exists in repo B's workspaces dir; its first chat message is the seeded task.
Also confirm the failure case (nonsense repo name) surfaces as a "system" failure message.

## Conventions to follow (from CLAUDE.md)

- Domains pattern: every change lives in `domains/agents` (and `packages/shared` for the
  settings schema default). No feature code outside domains.
- Colocated tests, Vitest only, explicit assertions, no snapshots; use the real
  harness (real DB/git), no mocks of internal modules.
- Thin routes: all validation in `service/`, routes stay thin — all logic changes are in
  `service/runnerTags.ts`/`service/tagInstructions.ts`, no route changes.
- Keep domain READMEs (5-section) updated as part of the change.
- Gates (`typecheck`/`build`/`lint`) only at the end of the work, not mid-fixing.
