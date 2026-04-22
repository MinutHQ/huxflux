# HuxFlux

HuxFlux is an AI agent orchestrator that lets you manage, monitor, and coordinate multiple coding agents from a single interface. Think of it as a control room for your AI-powered development workflow.

Spawn agents, assign them tasks, watch their progress in real time, review their code changes, and interact with them through chat. HuxFlux handles the orchestration so you can focus on directing the work rather than babysitting individual agents.

**Key features:**

- Run multiple coding agents in parallel across repositories
- Real-time chat, file diffs, and terminal views per agent
- GitHub PR integration (status tracking, review comments, CI monitoring)
- Jira integration for task management and syncing
- Tauri desktop app with web and mobile clients
- Kanban board for organizing agent tasks

## Project structure

- `apps/web` - React web client (TanStack Router, Tailwind, shadcn)
- `apps/server` - Node.js backend (Hono, Drizzle, SQLite)
- `apps/desktop` - Tauri desktop wrapper
- `apps/mobile` - Mobile client
- `apps/docs` - Documentation
- `apps/marketing` - Marketing site

## Status

HuxFlux has not yet had a stable release. We are actively working on a testing framework designed to let us ship confidently while keeping the entire codebase vibe coded. The goal is to prove that stability and vibe coding are not mutually exclusive.

## Contributing

Contributions are welcome. This is a 100% vibe coded project and we intend to keep it that way.

**What we care about:**

- A clear description of *what* your change does and *why* it exists. Explain the problem, the motivation, and how your approach solves it. The better the context, the faster we merge.

**What we don't care much about:**

- Code style, patterns, or how "clean" the implementation is. We won't nitpick your code unless there's a major bug or security issue that needs fixing. AI-generated code is not just accepted, it's expected. The AI is a first-class contributor here.

**In short:** describe the what and why well, let the AI write the code, and we'll ship it.
