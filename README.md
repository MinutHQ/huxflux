# Huxflux

Huxflux is a self-hosted orchestrator for AI coding agents. Spawn Claude Code, Codex, OpenCode, and other CLI agents in parallel across your repositories, each on its own isolated git worktree, and watch chat, file diffs, terminal output, and PR status in one interface. Built and maintained by [Minut](https://minut.com).

## Getting started

The fastest way to get going is the one-line installer. It installs the server, runs the setup wizard, and optionally installs the desktop app.

```sh
curl -fsSL https://raw.githubusercontent.com/MinutHQ/huxflux/main/install.sh | bash
```

The desktop app auto-connects to your local server on first launch. For manual installation, remote-access setup (Tailscale, nginx), and provider configuration see the [installation guide](https://huxflux.dev/docs/getting-started/installation).

## How this repo is built

This codebase is authored by AI coding agents end-to-end. Humans do not write code here directly. If you want to contribute, use an agentic coder (Claude Code, Cursor, Aider, similar). See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and quality gates.

## Architecture

Monorepo, pnpm workspaces.

- `apps/web` — Vite + React + TanStack Router. The primary client.
- `apps/server` — Node + Fastify + Drizzle SQLite. The orchestrator backend.
- `apps/desktop` — Tauri shell wrapping the web app.
- `apps/mobile` — Expo React Native client.
- `apps/docs` — Next.js docs site (Fumadocs).
- `apps/marketing` — Static HTML marketing experiments.
- `packages/shared` — Cross-platform types, hooks, API client, websocket logic.
- `packages/ui` — Headless / shadcn primitives shared by web (and mobile where compatible).
- `packages/tokens` — Design tokens (CSS variables, TS exports).

Most apps and packages follow a strict `domains/<name>/` pattern with eslint-enforced public-surface boundaries. See [CLAUDE.md](./CLAUDE.md) for the full architecture rules.

## License

Proprietary. All rights reserved. Built and maintained by [Minut](https://minut.com).

---

Built and maintained by [Minut](https://minut.com).
