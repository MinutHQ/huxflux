# mcp

Exposes Huxflux to other AI assistants over the Model Context Protocol. A Claude Code, Cursor or Codex session pointed at `/mcp` can list repos, spawn a new agent in its own worktree, hand it a prompt, send follow-ups, and read the agent's answer back.

## Owns

- The `/mcp` Streamable HTTP endpoint (POST for JSON-RPC, GET/DELETE answered by the SDK). Stateless: one `McpServer` + transport per request.
- The MCP tool set: `list_repos`, `create_agent`, `send_message`, `list_agents`, `get_agent`.
- The in-process bridge that runs each tool through the server's own REST routes via `app.inject`, so MCP callers get the same validation and behaviour as the web and mobile clients.

## Public surface

- `mcp.routes.ts` — exposes `mcpPlugin`, the Fastify plugin registering `/mcp`. Wired through the registry at `src/domains/index.ts`.

## Depends on

- `@modelcontextprotocol/sdk` — `McpServer`, `StreamableHTTPServerTransport`
- `src/domains/agents` — REST routes (via inject), `title.ts` for branch slugs
- `src/domains/agent-runner/agent-runner.service.ts` — `isAgentRunning`
- `src/domains/repos` — REST routes (via inject)
- `src/config.ts` — `authToken` for the injected requests, `mcpServerName` for `serverInfo.name`
- `src/auth.ts` — lists `/mcp` as an authenticated prefix

## Sub-domains

None.

## Quirks

- Tools never touch the DB directly. They call `/api/...` in-process with the server's own Bearer token; the one exception is `isAgentRunning` from the agent-runner public surface, because the REST payload has no live-running flag. This keeps one code path for agent creation (worktree pool, setup script, PR auto-link) but means MCP errors surface as `HTTP <status>: <route error>` strings.
- `create_agent` mirrors the web client's branch default: `<repo branchPrefix or "agent">/<slug of title>`, and `local` + `noWorktree` for folder-type repos.
- Prompts are sent without `sender`. A user message carrying `sender` renders in the web client as a collapsed "linked workspace" card; the task an outside assistant hands over should be readable at a glance.
- The endpoint is hidden from `/docs` (`schema.hide`) because Swagger cannot describe a JSON-RPC surface usefully.
- `MCP_SERVER_NAME` env overrides the name reported in `serverInfo` (default `huxflux`); `huxflux config mcp-name <name>` persists it in the CLI's `config.json` and the supervisor passes it through. Client-side display names come from the client's own config key, not from this.
- Connect from Claude Code with:
  `claude mcp add --transport http huxflux http://<host>:<port>/mcp --header "Authorization: Bearer <AUTH_TOKEN>"`
