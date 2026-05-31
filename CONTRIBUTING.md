# Contributing to Huxflux

This repository is authored by AI coding agents. Humans do not write code here directly. Every contribution comes through an agentic coder.

## Required tooling

- An agentic coder. The repo is set up for [Claude Code](https://docs.claude.com/claude-code), but Cursor, Aider, or any comparable tool works too.
- Node 22.6 or later.
- pnpm 11.3 or later.

## Workflow

1. **Understand the task.** Start from a chat, ticket, or issue. Make sure the scope is clear before writing code. If something is ambiguous, ask before guessing.
2. **Open the worktree in your agentic coder.** The root [CLAUDE.md](./CLAUDE.md) and every subtree CLAUDE.md exist so the next agent reads less, decides less, and ships higher quality without supervision. Point your agent at them.
3. **Build the change inside the appropriate domain.** Features live under `apps/*/src/domains/<name>/` and `packages/shared/src/domains/<name>/`. Use the scaffolding skills (`/scaffold-domain`, `/scaffold-server-domain`, `/scaffold-component`, `/scaffold-route`, `/scaffold-test`) when starting fresh. They produce conforming code by construction.
4. **Run the 7 quality gates locally** before opening the PR (see below). All must exit 0.
5. **Commit once at the end.** Use `/commit` to produce a conventional-commit message from the staged diff. Do not commit after every fix during a session.
6. **Open the PR with `/pr-description`.** It reads the branch's commits plus diff vs `main`, fills `.github/PULL_REQUEST_TEMPLATE.md`, and outputs a ready-to-run `gh pr create` command.
7. **Address review comments** by replying to each thread with how it was fixed, resolving the thread, and re-requesting review from the original reviewer.

## Quality gates

The following must all pass before merge. CI runs every one of them on every push and PR.

Structural checks:

- `node scripts/check-domains.mjs` — every domain has a README
- `node scripts/check-migrations.mjs` — DB migration versions strictly increasing

Standard gates:

- `pnpm typecheck` (runs `tsc -b --noEmit` across every workspace)
- `pnpm lint` (eslint over the whole monorepo, plus the two structural checks above)
- `pnpm build`
- `pnpm test` (Vitest, run targeted via the `gate-test` agent)

If a gate command stops working, fix it. Do not bypass it.

## Architecture

See the [root CLAUDE.md](./CLAUDE.md) for the full architecture rules, design-system non-negotiables, file size limits, and naming conventions. Every domain has its own `README.md` under `apps/*/src/domains/<name>/` and `packages/shared/src/domains/<name>/`. Read the relevant ones before changing anything in that area.

Key rules in brief:

- Code outside `domains/<x>/` may only import `domains/<x>` (the index), never deeper. Eslint enforces this.
- File caps: 300 lines for `.tsx`, 400 lines for `.ts`, 80 lines per function. Hitting the cap means the file wants to be split.
- Icons: `@tabler/icons-react` only. Colors: CSS-variable Tailwind classes only (no hardcoded `zinc-*`, `slate-*`, `gray-*`).
- No new state stores. Use TanStack Query for server state, React state for local UI state.

## Filing issues

Use the [issue templates](./.github/ISSUE_TEMPLATE). Issues that ignore the template may be closed without action.

## Style

- No em dashes anywhere. Use commas, periods, or parentheses.
- No `console.log` in committed code. `console.info`, `console.warn`, and `console.error` are allowed.
- No `as any` or `@ts-ignore` to silence type errors. Fix the type, or ask.

## Code of conduct

Be excellent to each other.

---

Maintained by [Minut](https://minut.com).
