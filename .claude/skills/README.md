# Project Skills

Project-local skills for Huxflux. Every contribution here comes from an agentic coder, and these skills exist so the next agent produces code, commits, and PRs that match the repo's conventions without re-deriving them from scratch.

Skills are invoked through Claude Code as slash commands: `/scaffold-domain`, `/commit`, etc. They can also be called programmatically via the Skill tool with the exact name (no leading slash).

## Available skills

### Understanding the task

- **kickoff**: Establish shared understanding of a task before writing any code. Restate the ask, surface ambiguity, ask 1-3 structured questions, propose an approach with trade-offs. Run this first on any non-trivial task.
- **discuss**: Enter conversation mode. No code is written. Read the codebase to ground the discussion, reason through trade-offs, surface edge cases. Use when the user wants to think before building.

### Scaffolding

- **scaffold-domain**: Create a new `domains/<name>/` folder following the Huxflux domain pattern. Targets `apps/web`, `apps/mobile`, or `packages/shared`. Use when starting a new feature area outside the server.
- **scaffold-server-domain**: Create a new `apps/server/src/domains/<name>/` folder. Sets up README, index, the Fastify plugin skeleton, and registers the plugin in the domain registry. Use when extracting or starting a server-side feature.
- **scaffold-component**: Create a new domain-internal React component inside an existing domain (web or mobile). Use when adding UI inside a domain you are already working on.
- **scaffold-route**: Create a new TanStack Router route file (web) that delegates to a domain. Use when wiring a domain into the URL routing.
- **scaffold-test**: Create a Vitest test file collocated next to a source module (server or `packages/shared`). Use when adding coverage to one of the categories listed in the root CLAUDE.md "When to test" section.

### Migration

- **promote-domain**: Promote a flat directory (or related set of flat files) into a proper `domains/<name>/` folder. Adds a README, rewrites consumers to import from specific top-level files in the new domain (no per-domain barrel), and clears matching legacy-path lint overrides. Use when a flat area has grown enough to deserve domain status.

### Verification

- **check-domain**: Run the structural check (`check-domains`) without running the full lint suite. Use mid-task to self-verify a domain still conforms.

### Commit and PR

- **commit**: Generate a conventional-commit message from the current staged diff in the project's voice. Outputs the message only, does not run `git commit`. Use at the end of a session before commit.
- **pr-description**: Generate a PR description for the current branch from its commits and diff vs `main`, fills in `.github/PULL_REQUEST_TEMPLATE.md`, outputs a ready-to-run `gh pr create` command. Use when opening a PR.

## When to use which (decision guide)

| You are about to... | Use |
|---|---|
| Start a new task and need to understand what the user wants | `/kickoff` |
| Think through a design or debug session without writing code | `/discuss` |
| Start a brand-new feature area | `/scaffold-domain` (web/mobile/shared) or `/scaffold-server-domain` (server) |
| Add UI inside an existing domain | `/scaffold-component` |
| Hook a domain into the URL | `/scaffold-route` |
| Add coverage for runner / migration / git / parser code | `/scaffold-test` |
| Verify a domain still passes structural checks | `/check-domain` |
| Commit staged changes | `/commit` |
| Open a PR | `/pr-description` |

If no skill matches and you find yourself doing the same scaffolding by hand twice, ask whether a new skill should be added.

## Skill format

Each skill lives in `.claude/skills/<name>/SKILL.md` with YAML frontmatter:

```yaml
---
name: <skill-name>
description: <one-line description shown in the skill picker>
---
```

The body of the file describes what the agent does step by step. The harness loads the description into the skill list and the body becomes the instructions when the skill is invoked. Keep skills outcome-focused: they should produce a conforming artifact, not just explain a convention.

## Backlog

- **Merge `scaffold-domain` + `scaffold-server-domain` into one parameterized skill.** They share most of the workflow (verify path is empty, write README, run the structural check). The server variant adds three concerns: it writes `<name>.routes.ts`, registers the plugin in `apps/server/src/domains/index.ts`, and has a slightly different README template (Fastify plugin as the public top-level file). A single `scaffold-domain` with a `--target server|web|mobile|shared` argument would eliminate the duplication. Defer until either skill needs a substantial update so both can be aligned in one pass.
