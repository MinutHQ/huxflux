# codex-usage

## Owns

Cross-platform API and response contract for Codex plan usage.

## Public surface

- `codex-usage.types.ts`: `codexUsageSchema` and `CodexUsage`, using the same normalized window shape as Claude.
- `codex-usage.api.ts`: `codexUsageApi.current()` calls GET `/api/codex/usage` with a 12-second timeout.

## Depends on

The Claude usage schema, Zod, and the shared validated HTTP client.

## Sub-domains

None.

## Quirks

Usage is scoped to the server machine; query keys include its URL. Missing windows are null, and 0% remains valid data. Codex spend is unavailable and remains null.
