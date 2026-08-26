# claude-usage

Reads the local Claude Code OAuth token, calls Anthropic's plan-usage endpoint (the same data the `/usage` slash command shows), and normalizes it to the two windows the sidebar renders: the 5-hour rolling session window and the 7-day weekly window. Also tracks the usage-credit spend total over time, since upstream reports only a running total and the sidebar shows how much it moved over the last hour, day, and week.

## Owns

- The `/api/claude/usage` REST surface: GET returning a normalized `ClaudeUsage` snapshot
- OAuth token resolution mirroring the official CLI: `CLAUDE_CODE_OAUTH_TOKEN` env var, then the macOS keychain (`Claude Code-credentials`), then `${CLAUDE_CONFIG_DIR:-~/.claude}/.credentials.json`
- The upstream call to `${ANTHROPIC_BASE_API_URL:-https://api.anthropic.com}/api/oauth/usage` with the `oauth-2025-04-20` beta header and a 5-second timeout
- The pure `mapUsageResponse` mapping from Anthropic's `five_hour` / `seven_day` / `spend` payload to the `session` / `weekly` / `spend` shape
- The `claude_usage_samples` table (migration v34): a rolling log of observed credit totals, and the hour/day/week deltas derived from it

## Public surface

- `claude-usage.routes.ts` — exposes `claudeUsagePlugin`, the Fastify plugin registering GET `/api/claude/usage`. Wired through the registry at `src/domains/index.ts`.
- `claude-usage.db.ts` — exposes `claudeUsageSamples`, the Drizzle table backing the spend history. Re-exported by the `src/db/schema.ts` barrel.

## Depends on

- `@huxflux/shared` — `claudeUsageSchema` (response validation) and the `ClaudeUsage` / `ClaudeUsageSpend` types
- `src/db/index.ts` — the `db` singleton, for reading and writing spend samples
- `src/logger.ts` — warn-level logging on fetch failure
- `node:child_process` (`execFile` for the keychain lookup), `node:fs/promises`, `node:os`, `node:path` — token resolution

## Sub-domains

None.

## Quirks

- The endpoint never throws. A missing token, a 401/403 (bad/revoked token), or any failure with no prior reading resolves to `{ connected: false, error }` so the sidebar degrades gracefully. Transient failures (timeout, 429, 5xx, network errors) return the last good reading while a token is still present — the service keeps a process-global last-good snapshot so a single flaky poll doesn't blank the bars. The cache is dropped on sign-out (no token) and on auth failure.
- Token resolution is best-effort and platform-aware. The keychain branch only runs on macOS; everything else relies on the env var or the plaintext credentials file.
- `utilization` is passed through as the upstream 0–100 percentage; no rescaling happens here.
- Spend is carried in minor units (`amountMinor` + `exponent`), never as a float, so nothing rounds between the API and the render. Formatting to a currency string is the client's job.
- Samples are written opportunistically from the request handler, not a background job: a client polls once a minute while the app is open, and a sample is written only when the total changes, the currency changes, or the newest row is older than 15 minutes. With the app closed nothing is recorded, so a window's baseline can be older than the window itself — that is intended, and it makes the deltas exact rather than interpolated.
- A window's delta is null when no sample sits at or before its boundary. Null means "no history that far back", so the sidebar omits the delta entirely and shows the total alone. It must never be shown as a change of zero.
- Anthropic resets the credit total each billing cycle, so a raw subtraction can go negative. `deltaFrom` treats any drop as a reset and reports the current total instead. This can overstate a short window immediately after a reset; a negative currency amount in the sidebar would be worse.
- Samples older than 30 days are pruned on write.
