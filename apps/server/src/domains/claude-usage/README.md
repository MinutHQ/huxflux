# claude-usage

Reads the local Claude Code OAuth token, calls Anthropic's plan-usage endpoint (the same data the `/usage` slash command shows), and normalizes it to the two windows the sidebar renders: the 5-hour rolling session window and the 7-day weekly window. Also tracks the usage-credit spend total over time, since upstream reports only a running total and the sidebar shows how much it moved over the last hour, day, and week.

## Owns

- The `/api/claude/usage` REST surface: GET returning a normalized `ClaudeUsage` snapshot
- OAuth token resolution mirroring the official CLI: `CLAUDE_CODE_OAUTH_TOKEN` env var, then the macOS keychain (`Claude Code-credentials`), then `${CLAUDE_CONFIG_DIR:-~/.claude}/.credentials.json`
- The upstream call to `${ANTHROPIC_BASE_API_URL:-https://api.anthropic.com}/api/oauth/usage` with the `oauth-2025-04-20` beta header and a 5-second timeout
- The pure `mapUsageResponse` mapping from Anthropic's `five_hour` / `seven_day` / `spend` payload to the `session` / `weekly` / `spend` shape
- The `claude_usage_samples` table (migration v34): a rolling log of observed credit totals, and the hour/day/week deltas derived from it
- The `claude_usage_cache` table (migration v35): the last good reading, used both to throttle upstream calls and to survive a restart

## Public surface

- `claude-usage.routes.ts` — exposes `claudeUsagePlugin`, the Fastify plugin registering GET `/api/claude/usage`. Wired through the registry at `src/domains/index.ts`.
- `claude-usage.db.ts` — exposes `claudeUsageSamples` and `claudeUsageCache`, the Drizzle tables backing the spend history and the cached reading. Re-exported by the `src/db/schema.ts` barrel.

## Depends on

- `@huxflux/shared` — `claudeUsageSchema` (response validation) and the `ClaudeUsage` / `ClaudeUsageSpend` types
- `src/db/index.ts` — the `db` singleton, for reading and writing spend samples
- `src/logger.ts` — warn-level logging on fetch failure
- `node:child_process` (`execFile` for the keychain lookup), `node:fs/promises`, `node:os`, `node:path` — token resolution

## Sub-domains

None.

## Quirks

- The endpoint never throws. A missing token, a 401/403 (bad/revoked token), or any failure with no prior reading resolves to `{ connected: false, reason, error }` so the sidebar degrades gracefully. Transient failures (timeout, 429, 5xx, network errors) return the last good reading while a token is still present, so a single flaky poll doesn't blank the bars. The cache is dropped on sign-out (no token) and on auth failure.
- A successful reading is served for 60 seconds without going upstream again. Anthropic's usage endpoint is rate-limited and every open client polls once a minute, so without the throttle the upstream call rate scales with the number of connected clients and the account starts collecting 429s. One poll per minute total is the ceiling regardless of how many clients are watching.
- The last good reading is persisted, not just held in memory. A server that restarts straight into a rate limit would otherwise have nothing to fall back on and would blank the sidebar entirely; the stored row means it still shows the last known numbers. The in-memory copy is the hot path and the row is only read once per process.
- A stored payload that no longer parses against `claudeUsageSchema` (written by an older build, then a schema change) is discarded rather than served, so schema drift costs one upstream call instead of producing a response the client rejects.
- Token resolution is best-effort and platform-aware. The keychain branch only runs on macOS; everything else relies on the env var or the plaintext credentials file.
- `utilization` is passed through as the upstream 0–100 percentage; no rescaling happens here.
- `reason` is the machine-readable failure kind (`no-token`, `rate-limited`, `auth`, `unavailable`); `error` carries the prose. The client branches on `reason` so no consumer has to pattern-match an error string to decide what to render.
- Spend is carried in minor units (`amountMinor` + `exponent`), never as a float, so nothing rounds between the API and the render. Formatting to a currency string is the client's job.
- Samples are written opportunistically from the request handler, not a background job: a client polls once a minute while the app is open, and a sample is written only when the total changes, the currency changes, or the newest row is older than 15 minutes. With the app closed nothing is recorded, so a window's baseline can be older than the window itself — that is intended, and it makes the deltas exact rather than interpolated.
- A window's delta is null when no sample sits at or before its boundary. Null means "no history that far back", so the sidebar omits the delta entirely and shows the total alone. It must never be shown as a change of zero.
- Anthropic resets the credit total each billing cycle, so a raw subtraction can go negative. `deltaFrom` treats any drop as a reset and reports the current total instead. This can overstate a short window immediately after a reset; a negative currency amount in the sidebar would be worse.
- Samples older than 30 days are pruned on write.
