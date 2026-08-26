# claude-usage

Cross-platform type and API slice for the Claude.ai plan-usage snapshot shown in the sidebar. Mirrors the server-side `claude-usage` domain.

## Owns

- The `ClaudeUsage` shape returned by `/api/claude/usage` (connected flag, the 5-hour `session` window, the 7-day `weekly` window, the `spend` extra-usage total with its hour/day/week deltas, a machine-readable failure `reason`, and an optional error string)
- The `claudeUsageApi` HTTP slice: `current()` with an 8-second timeout

## Public surface

- `claudeUsageApi` — claude-usage HTTP slice, merged into the composed `api` object at the package root
- `claudeUsageSchema`, `claudeUsageWindowSchema`, `claudeUsageSpendSchema`, `claudeUsageSpendDeltasSchema`, `claudeUsageReasonSchema` — Zod schemas for `/api/claude/usage`
- `ClaudeUsage`, `ClaudeUsageWindow`, `ClaudeUsageSpend`, `ClaudeUsageSpendDeltas`, `ClaudeUsageReason` — inferred types

## Depends on

- `../../apiBase` — `reqValidated` for the api slice

## Sub-domains

None.

## Quirks

- `utilization` is a 0–100 percentage (mirrors Anthropic's `five_hour.utilization` / `seven_day.utilization`), not a 0–1 fraction.
- Branch on `reason`, never on `error`. `no-token` means the feature does not apply (render nothing); the other three are real failures worth surfacing. `error` is prose for a tooltip or a log, not for control flow.
- Both windows are nullable: a window is null when the upstream response omits it or no token is available. Consumers should render nothing for a null window rather than assuming zero usage.
- `spend` is money in minor units: `amountMinor / 10 ** exponent` gives the major amount (34654 with exponent 2 is 346.54). Kept integral so nothing rounds in transit; consumers format it with `Intl.NumberFormat`.
- Each entry in `spend.deltas` is nullable and independently so. Null means the server has no reading reaching back that far, not that the total held steady — omit it rather than rendering a zero or a placeholder.
