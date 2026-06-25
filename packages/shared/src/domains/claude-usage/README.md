# claude-usage

Cross-platform type and API slice for the Claude.ai plan-usage snapshot shown in the sidebar. Mirrors the server-side `claude-usage` domain.

## Owns

- The `ClaudeUsage` shape returned by `/api/claude/usage` (connected flag, the 5-hour `session` window, the 7-day `weekly` window, and an optional error string)
- The `claudeUsageApi` HTTP slice: `current()` with an 8-second timeout

## Public surface

- `claudeUsageApi` — claude-usage HTTP slice, merged into the composed `api` object at the package root
- `claudeUsageSchema`, `claudeUsageWindowSchema` — Zod schemas for `/api/claude/usage`
- `ClaudeUsage`, `ClaudeUsageWindow` — inferred types

## Depends on

- `../../apiBase` — `reqValidated` for the api slice

## Sub-domains

None.

## Quirks

- `utilization` is a 0–100 percentage (mirrors Anthropic's `five_hour.utilization` / `seven_day.utilization`), not a 0–1 fraction.
- Both windows are nullable: a window is null when the upstream response omits it or no token is available. Consumers should render nothing for a null window rather than assuming zero usage.
