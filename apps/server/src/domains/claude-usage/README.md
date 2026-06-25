# claude-usage

Reads the local Claude Code OAuth token, calls Anthropic's plan-usage endpoint (the same data the `/usage` slash command shows), and normalizes it to the two windows the sidebar renders: the 5-hour rolling session window and the 7-day weekly window.

## Owns

- The `/api/claude/usage` REST surface: GET returning a normalized `ClaudeUsage` snapshot
- OAuth token resolution mirroring the official CLI: `CLAUDE_CODE_OAUTH_TOKEN` env var, then the macOS keychain (`Claude Code-credentials`), then `${CLAUDE_CONFIG_DIR:-~/.claude}/.credentials.json`
- The upstream call to `${ANTHROPIC_BASE_API_URL:-https://api.anthropic.com}/api/oauth/usage` with the `oauth-2025-04-20` beta header and a 5-second timeout
- The pure `mapUsageResponse` mapping from Anthropic's `five_hour` / `seven_day` payload to the `session` / `weekly` shape

## Public surface

- `claude-usage.routes.ts` — exposes `claudeUsagePlugin`, the Fastify plugin registering GET `/api/claude/usage`. Wired through the registry at `src/domains/index.ts`.

## Depends on

- `@huxflux/shared` — `claudeUsageSchema` (response validation) and the `ClaudeUsage` type
- `src/logger.ts` — warn-level logging on fetch failure
- `node:child_process` (`execFile` for the keychain lookup), `node:fs/promises`, `node:os`, `node:path` — token resolution

## Sub-domains

None.

## Quirks

- The endpoint never throws: missing token, non-2xx upstream response, and network errors all resolve to `{ connected: false, error }` so the sidebar can degrade gracefully instead of surfacing a request failure.
- Token resolution is best-effort and platform-aware. The keychain branch only runs on macOS; everything else relies on the env var or the plaintext credentials file.
- `utilization` is passed through as the upstream 0–100 percentage; no rescaling happens here.
