# Huxflux — Agent Authoring Guide

This repo is authored by AI agents. No human writes code directly. Every rule here exists so the next agent reads less, decides less, and ships higher quality without supervision.

**Read this whole file before making any change.** Then read the relevant subtree CLAUDE.md.

## Quality Gate Commands

Run via the matching gate agent (`gate-typecheck`, `gate-build`, `gate-test`, `gate-lint`). Do not run gates during a fixing session; only when finishing work or before push.

- **Typecheck:** `pnpm typecheck` (runs `tsc -b --noEmit` across every workspace)
- **Build:** `pnpm build`
- **Test:** `pnpm test` (Vitest, run targeted via the `gate-test` agent; never the full suite unless asked)
- **Lint:** `pnpm lint` (eslint over the whole monorepo, plus `check-domains` and `check-migrations` structural checks)

If a gate command stops working, fix it. Do not bypass it.

## When to test

Tests are collocated (`foo.ts` and `foo.test.ts` side-by-side). No `__tests__/` directories. No snapshot testing (`toMatchSnapshot`, `toMatchInlineSnapshot`); write explicit assertions even when verbose. Vitest is the only runner; use the `/scaffold-test` skill to seed new test files.

The `gate-test` agent finds and runs ONLY the tests relevant to the changes in the current session. Never run the full suite unless the user explicitly asks. If a test file is unrelated to your diff, leave it alone.

Categories that MUST get tests when you touch them:

- Agent orchestration code in `apps/server/src/domains/agent-runner/` (runner state machine, stream handlers, meta-directive parsers, finalize, persist-message). The peer `apps/server/src/domains/agents/service/` (title, rename, message-queue, setup-script) also gets tests when it changes.
- The migration runner in `apps/server/src/db/index.ts` and any new migration logic that mutates schema or data.
- Git and worktree operations under `apps/server/src/git/`. Use `createGitTmpRepo()` from the server harness; do not stub git.
- Cross-platform pure logic in `packages/shared/` (parsers, derivations, schema defaults).
- Any state machine or parser anywhere. Branches without coverage are silent failures waiting to happen.

Do NOT write tests for:

- UI components (web/mobile/desktop). The frontend has no test runner yet; do not stand one up.
- Thin route files that only parse a request and call a service. Test the service.
- Mocks of internal modules. The harness exists so you can use the real DB, real git, real spawn. The fake-claude binary in `apps/server/test/fixtures/` is a real subprocess driven by JSON fixtures, not a mock.

## Repository Layout

Monorepo, pnpm workspaces.

```
apps/
  web/         Vite + React + TanStack Router. The primary client.
  desktop/     Tauri shell wrapping the web app.
  mobile/      Expo React Native.
  server/      Node + Fastify + Drizzle SQLite. The orchestrator backend.
  docs/        Next.js docs site. Content-driven, not domain-shaped.
  marketing/   Static HTML experiments. Not part of the build pipeline.
packages/
  shared/      Cross-platform types, hooks, API client, websocket logic.
  ui/          Headless / shadcn primitives. Used by web (and mobile where compatible).
  tokens/      Design tokens (CSS variables, TS exports).
```

Web, server, mobile, `packages/shared`, `packages/ui` all use the `domains/` pattern below. Desktop wraps web. Docs and marketing keep their own shape but each has its own CLAUDE.md.

## The `domains/` Pattern (THE rule)

Every feature lives in `src/domains/<name>/`. Nothing feature-specific lives outside it.

```
domains/<name>/
  README.md     5 sections: Owns, Public surface, Depends on, Sub-domains, Quirks.
  <Public>.ts   Top-level files = public surface (see Public Surface Rule).
  <Public>.tsx
  routes/       Domain-internal route files (web/mobile/server). Optional.
  components/   Domain-internal components. Optional.
  hooks/        Domain-internal hooks. Optional.
  service/      Domain-internal business logic. Optional.
  screens/      Domain-internal screen components (mobile). Optional.
  dialogs/      Domain-internal dialogs (web). Optional.
  views/        Domain-internal view components (web). Optional.
```

**Boundary rule (eslint-enforced for alias imports):** code outside `domains/<x>/` may import any top-level `.ts`/`.tsx` file in the target domain (e.g. `@/domains/agents/AgentList`). Reaching into a subfolder from outside the domain is a build error. Intra-domain code uses relative paths freely.

There is no per-domain `index.ts` barrel. The set of top-level files IS the public surface.

**Nesting:** one level of sub-domain is allowed (`domains/<x>/sub-domains/<y>/`). If you need two levels, the inner thing wants to be its own top-level domain.

### Where new code goes

- New feature surface → new `domains/<name>/`. Use `/scaffold-domain <name>`.
- New shared primitive (button, input, dialog) → `packages/ui/src/`. Use `/add-shadcn-primitive`.
- New cross-platform type, hook, or API helper → `packages/shared/src/domains/<name>/` (mirror the app-side domain name).
- New design token → `packages/tokens/src/tokens.ts`.
- App-shell stuff (top-level layout, error boundary, command palette) → `apps/web/src/app-shell/` (NOT a domain — it's the shell that hosts domains).
- One-off util that doesn't belong to any domain → push back. There is almost always a domain it belongs to.

If you can't decide where something goes, it's a signal the abstraction is wrong. Stop and reconsider, don't pick the convenient location.

## Public Surface Rule

A domain's contract is the set of its top-level `.ts`/`.tsx` files. Three rules:

1. Top-level files in `domains/<x>/` are public. Subfolders (`components/`, `hooks/`, `service/`, `screens/`, `dialogs/`, `views/`, `routes/`, `sub-domains/`, etc.) are domain-internal. Cross-domain consumers import from a specific top-level file (e.g. `@/domains/agents/AgentList`, `import { runAgent } from "../agent-runner/agent-runner.service.js"`). Intra-domain code uses relative paths into any subfolder freely.
2. The README's "Public surface" section is human-maintained. It should list every top-level file (or symbol group) and what it exposes, with a one-line description. There is no script that enforces sync; treat it as the canonical contract for human reviewers.
3. Adding or removing a top-level file is a breaking change. Search for cross-domain callers before doing it.

When the public symbol's implementation lives in a subfolder (a service helper, a deeply-nested component), expose it via a thin top-level re-exporter file named after the symbol (e.g. `domains/agents/title.ts` re-exports from `./service/title.ts`). The re-exporter is the public-surface declaration; the subfolder remains internal.

The top-level `packages/shared/src/index.ts` is the SINGLE exception: `@huxflux/shared` is one package, and that barrel composes its full public surface by re-exporting directly from per-domain sub-files. Internal package files may import from any path; external consumers use `@huxflux/shared` only.

## File Size Limits

Lint-enforced. Hard caps, not guidelines.

- `.tsx` files: 300 lines max
- `.ts` files: 400 lines max
- functions: 80 lines max

If you're hitting the cap, the file wants to be split. Don't bypass with `eslint-disable`. The `SIZE_OVERRIDES` list in `eslint.config.js` enumerates every existing offender (some permanent, some backlog, each labelled in the file). New files do not get added.

## Design System Non-Negotiables

Most of these are eslint-enforced (`no-restricted-syntax`, `no-restricted-imports`). Here for context.

- **Icons:** `@tabler/icons-react` ONLY. `lucide-react` is forbidden. Use `size={N}` prop, not `className="w-N h-N"`.
- **Tailwind colors:** Use CSS-variable classes (`bg-background`, `bg-card`, `bg-sidebar`, `text-foreground`, `text-muted-foreground`, `border-border`, etc.). Hardcoded `zinc-*`, `slate-*`, `gray-*` classes are forbidden — they break the warm taupe palette.
- **Sidebar tokens:** the left nav uses `bg-sidebar`, `border-sidebar-border`, `text-sidebar-foreground`, `bg-sidebar-accent`. Generic `bg-background` is wrong there.
- **Active state pattern:** `border-b-2 border-foreground text-foreground` for active tabs (not violet/primary).
- **shadcn primitives:** `packages/ui` is the source. Do not re-implement Button/Switch/Select/etc. in app code.
- **Dark mode:** `dark` class lives on `<html>` (set in `index.html`). Never in CSS.
- **Buttons:** `variant` + `size` props from the radix-nova preset. Common sizes: `icon-xs`, `icon-sm`, `sm`, `default`. Common variants: `ghost`, `outline`, `default`.

## Naming Conventions

These conventions are already consistent across the codebase. Follow them so they stay that way.

### Identifiers

- **Acronyms in camelCase**: `Id` (not `ID`), `Url` (not `URL`), `Api` (not `API`). Examples: `agentId`, `repoUrl`, `apiBase`, `parentAgentId`. Native APIs that capitalize differently (`Linking.openURL`, `crypto.randomUUID`) keep their original spelling.
- **SCREAMING_SNAKE_CASE**: reserved for true compile-time constants (e.g., the `MIGRATIONS` array in `apps/server/src/db/index.ts`). Module-level `const` that holds a derived or runtime value stays camelCase.

### File naming

- **Components**: PascalCase, one component per file. `AgentRow.tsx`, `FileViewerPanel.tsx`.
- **Hooks**: file name matches the hook name. `useWorkspace.ts`, `useAgentLifecycle.ts`.
- **Utilities and services**: camelCase. `titleToBranchSlug.ts`, `parseUnifiedDiff.ts`.
- **Routes**: kebab-case where the framework allows. TanStack uses `agent.$agentId.tsx`, Expo Router uses `pr-review.tsx`.
- **Domain READMEs**: always `README.md`. Per-domain barrels do not exist; top-level files in a domain ARE the public surface (see the Public Surface Rule).
- **Domain layer files**: `<domain>.<layer>.ts`. Top-level layer files in every domain are prefixed with the domain name. The layers are: `routes`, `service` (single-file case), `db`, `types`, `ws`, `job` (background scheduled work), `api`, `hooks`, `state`, `store`, `schema`. Examples: `tasks.routes.ts`, `agents.db.ts`, `pull-requests.job.ts`, `settings.schema.ts`. Hyphenated domains keep their hyphen (e.g. `agent-runner.service.ts`, `pull-requests.routes.ts`). Function-specific top-level files (re-exporters like `title.ts`, `prStatus.ts`; PascalCase components/screens; descriptive utilities like `utils.ts`, `config.ts`) keep their bare names. Test files mirror their source's prefix (`tasks.service.test.ts` next to `tasks.service.ts`). Subfolder contents (`service/parser.ts`, `components/Button.tsx`, `hooks/useFoo.ts`) stay bare since they are already qualified by the folder. Background scheduled jobs use the `job` layer (renamed from the older `poller` term); the `Job` interface lives in `apps/server/src/jobTypes.ts` and the registry in `apps/server/src/jobs.ts`.

### Types vs interfaces

- `interface` for object shapes that consumers might extend or that benefit from declaration merging.
- `type` for unions, tuples, mapped types, function types.
- For one-shot object shapes, either works; `interface` is the more common choice in this repo, so default to it for new object types unless you need a `type`-only feature.

### Function naming

- **Actions**: verb-noun. `createAgent`, `removeWorktree`, `applyBranchRename`.
- **Predicates**: `isX` or `hasX`. `isAgentRunning`, `hasReserve`.
- **Getters**: `getX` for synchronous, `loadX` or `fetchX` for asynchronous data access.
- **Builders**: `buildX` for functions that assemble a structured value (e.g., `buildSpawnArgs`).
- **Handlers in components**: `handleX` or `onX`. Pick one per file and stick to it; do not mix the two styles in the same component.

## Layout Patterns (web)

- Root: `flex h-screen overflow-hidden` → fixed-width sidebar + flex-1 ResizablePanelGroup.
- Every `flex-col` parent that hosts a scrollable child needs `min-h-0`. Without it, ScrollArea overflows.
- `ScrollArea` must always be inside a `flex-1 min-h-0` div with `h-full` on the ScrollArea.
- `react-resizable-panels` uses `orientation="horizontal"` / `"vertical"`, NOT `direction=`.

## Common Pitfalls (don't repeat)

- Do NOT use dynamic `await import("./...")` / `await import("@/...")` for internal modules. Eslint-enforced. Static imports only. Dynamic import is reserved for optional package-level loads (Tauri APIs when running in Tauri context, CLI-only `@clack/prompts`, pino-pretty fallback). If you think you need a dynamic internal import to break a cycle, the cycle is the bug. Fix the cycle by extracting the shared dependency to a third file.
- Import cross-platform types, API helpers, and hooks directly from `@huxflux/shared`. Never re-export them through a per-app shim.
- Do not put types in component files. Types go in `types.ts` of the owning domain, or in `packages/shared/src/` if cross-platform.
- Do not assume `array[0]` exists. Treat all index accesses as `T | undefined` and handle the missing case. The `noUncheckedIndexedAccess` flag is ON in `packages/shared`, `packages/ui`, and `packages/tokens`. It is currently OFF in `apps/server`, `apps/web`, and `apps/mobile` because each of those workspaces has pre-existing index-access offenders. New code in those apps must still handle index accesses defensively; flipping the flag per-app is the eventual goal once each workspace's count is small enough to fix in one pass.
- Do not introduce new state stores. Use TanStack Query for server state, React state for local UI state. If you think you need a global store, talk through it first.
- Do not commit `console.log`. The lint config allows `console.info` (tracing), `console.warn` (non-fatal failures), and `console.error` (real errors).
- Do not silence type errors with `as any` or `@ts-ignore`. If the type is wrong, fix the type. If you're stuck, ask.

## Working With Humans

Before you write code, you must understand what the human wants. Code is the last step, not the first. The cost of a clarifying question is small; the cost of building the wrong thing is hours. Optimise for the human's intent, not for the appearance of momentum.

- **Restate the task in your own words** before starting any non-trivial work. If you got it wrong, the human will correct you for free, before any code is written. Run `/kickoff` to structure this step.
- **Ask 1 to 3 questions** about ambiguous scope, design choices, or trade-offs. Use the `AskUserQuestion` tool when the choice is between 2 to 4 distinct paths. Use plain text in your reply when the question is open-ended or you just need a single clarification. Three is a ceiling, not a target.
- **Surface trade-offs explicitly** rather than picking the convenient option. The human owns architectural calls; you propose, they decide. Naming, file location, scope of cleanup, backwards-compatibility posture: all human calls unless they explicitly hand you the call.
- **Show small diffs early.** If a task expands into many files, propose the structure first and get sign-off before going wide. A 10-line preview is cheaper to redirect than a 1000-line commit.
- **Stop and re-evaluate when something feels off.** If you keep hitting the same kind of error, the design assumption is probably wrong, not the code. Pause, restate the problem, ask.
- **Never silently pick a load-bearing default.** When in doubt, ask. The user saying "you decide" is the only signal that you have explicitly been given the call.

For deeper discussion before any code is written, use `/discuss`. That skill forces conversation mode: no code, just reasoning.

## When You're About to Write New Code

1. Make sure you have a shared understanding of the task. See "Working With Humans" above. Run `/kickoff` if the scope is non-trivial.
2. Re-read this file and the subtree CLAUDE.md for the area you're touching.
3. Decide which domain your change belongs to. If unsure, that's a design discussion, not a coding task.
4. Prefer using a `/scaffold-*` skill if one exists for what you're doing. It produces conforming code by construction.
5. Keep the change minimal. Don't refactor adjacent code. Don't add fallbacks for impossible cases.

## Commit Convention

All commits use conventional commit format. The type prefix determines automatic version bumping.

**Format:** `<type>: <imperative summary>`

| Prefix | Version bump | When to use |
|--------|-------------|-------------|
| `feat:` | patch | New user-visible feature or capability |
| `fix:` | patch | Bug fix |
| `refactor:` | none | Internal restructuring, no behavior change |
| `chore:` | none | Tooling, build, dependencies, non-functional |
| `docs:` | none | Documentation only |
| `test:` | none | Test files only |

**Versioning rules (sub-v1):**
- We are pre-1.0. No major bumps. No minor bumps unless explicitly decided by a human.
- `feat:` and `fix:` bump **patch** (e.g. 0.3.5 to 0.3.6), not minor.
- Minor bumps (0.3.x to 0.4.0) only happen when a human explicitly says so.
- Breaking changes are noted in the commit body but do not trigger a major bump while sub-v1.

**PR titles** follow the same convention. The PR title becomes the merge commit message, so it must use the correct prefix. This drives the automated release flow.

**Message style:**
- Describe WHAT changed and WHY in plain language.
- No file paths, function names, or code references in the subject or body.
- Write for someone who will never read the diff.
- Use `/commit` skill to generate messages that follow these rules.

## Branch and Release Model

- `beta` — default branch, where all development happens. PRs target `beta`.
- `main` — production branch. Only receives merges from `beta`.

**Release flow:**
1. Work on feature branches, merge PRs into `beta`.
2. When ready to test: "Release Beta" workflow dispatch bumps version and publishes to npm `@beta` tag + GitHub pre-release.
3. Test on real machines.
4. When stable: merge `beta` into `main`. CI publishes to npm `@latest` + GitHub release.

Agents should always branch from and PR into `beta`, never `main`.

## Contributor Workflow (agentic)

Every contribution comes from an agentic coder. The required workflow:

1. Start from a task description (chat, ticket, issue). Run `/kickoff` to establish shared understanding before writing any code. See "Working With Humans" above.
2. Open or update the relevant CLAUDE.md or domain README if the scope changes the contract.
3. Build the change inside the appropriate domain. Use `/scaffold-domain` or `/scaffold-component` when starting fresh.
4. Run the quality gates locally before opening the PR: structural (`check-domains`, `check-migrations`) plus `typecheck`, `lint`, `build`, `test`. All must exit 0. See "Quality Gate Commands" above.
5. Use `/commit` to produce a conventional-commit message from the staged diff. Do not commit after every fix during a session; commit once at the end.
6. Open the PR with `/pr-description`. It reads the branch's commits plus diff vs `beta`, fills `.github/PULL_REQUEST_TEMPLATE.md`, and outputs a `gh pr create` command. Do not push or run `gh` without explicit user approval (see global Push Policy).
7. Address review comments by replying to each thread with how it was fixed, resolving the thread, and re-requesting review.

## Pointers

- `apps/web/CLAUDE.md` — web-app rules
- `apps/server/CLAUDE.md` — server rules
- `apps/mobile/CLAUDE.md` — mobile rules
- `apps/desktop/CLAUDE.md` — desktop rules
- `apps/docs/CLAUDE.md` — docs site rules
- `apps/marketing/CLAUDE.md` — marketing rules
- `packages/shared/CLAUDE.md` — shared package rules
- `packages/ui/CLAUDE.md` — UI package rules
- `packages/tokens/CLAUDE.md` — tokens package rules
- `.claude/skills/` — available skills (use `/scaffold-domain`, etc.)
- `.claude/agents/` — specialized subagents (e.g., `huxflux-domain-extractor`)
