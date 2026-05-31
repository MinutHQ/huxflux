# Project Skills

Project-local skills for Huxflux. Every contribution here comes from an agentic coder, and these skills exist so the next agent produces code, commits, and PRs that match the repo's conventions without re-deriving them from scratch.

Skills are invoked through Claude Code as slash commands: `/scaffold-domain`, `/commit`, etc. They can also be called programmatically via the Skill tool with the exact name (no leading slash).

## Available skills

### Understanding the task

- **kickoff**: Establish shared understanding of a task before writing any code. Restate the ask, surface ambiguity, ask 1-3 structured questions, propose an approach with trade-offs. Run this first on any non-trivial task.
- **discuss**: Enter conversation mode. No code is written. Read the codebase to ground the discussion, reason through trade-offs, surface edge cases. Use when the user wants to think before building.

### Scaffolding

- **scaffold-domain**: Create a new `domains/<name>/` folder for any platform (`web`, `server`, `mobile`, or `shared`). For server targets, also creates the Fastify plugin skeleton and registers it in the domain registry. Use when starting a new feature area.
- **scaffold-component**: Create a new domain-internal React component inside an existing domain (web or mobile). Use when adding UI inside a domain you are already working on.
- **scaffold-route**: Create a new TanStack Router route file (web) that delegates to a domain. Use when wiring a domain into the URL routing.
- **scaffold-test**: Create a Vitest test file collocated next to a source module (server or `packages/shared`). Use when adding coverage to one of the categories listed in the root CLAUDE.md "When to test" section.
- **scaffold-provider**: Create a new provider adapter (e.g. Mistral, Cohere) for the orchestrator. Creates the adapter file, extends the ProviderId union, and registers in the provider registry.

### Verification

- **check-domain**: Run the structural check (`check-domains`) without running the full lint suite. Use mid-task to self-verify a domain still conforms.

### Commit and PR

- **commit**: Generate a commit message from the staged diff. Describes WHAT changed and WHY in plain language, no code references. Humans read these. Outputs the message only, does not run `git commit` unless asked.
- **pr-description**: Generate a PR description from the branch's commits and diff. Explains what is being built, why, and the high-level approach. No code references. Outputs a ready-to-run `gh pr create` command.

## When to use which

| You are about to... | Use |
|---|---|
| Start a new task and need to understand what the user wants | `/kickoff` |
| Think through a design or debug session without writing code | `/discuss` |
| Start a brand-new feature area (any platform) | `/scaffold-domain` |
| Add UI inside an existing domain | `/scaffold-component` |
| Hook a domain into the URL | `/scaffold-route` |
| Add a new AI provider | `/scaffold-provider` |
| Add test coverage | `/scaffold-test` |
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
