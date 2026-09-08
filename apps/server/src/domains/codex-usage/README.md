# codex-usage

## Owns

GET `/api/codex/usage`, exposing normalized session and weekly subscription quota readings from the locally signed-in Codex CLI.

## Public surface

- `codex-usage.routes.ts`: `codexUsagePlugin`, registered in the domain registry.
- `codex-usage.service.ts`: `fetchCodexUsage` and the validated `mapCodexUsage` mapper.

## Depends on

The providers registry resolves the Codex executable (including `CODEX_BIN`). The CLI handles credentials, including `CODEX_HOME` and keychain storage. Shared supplies the response schema. Uses the documented [app-server protocol](https://learn.chatgpt.com/docs/app-server), `initialize` / `initialized` / `account/rateLimits/read` over stdio.

## Sub-domains

None.

## Quirks

- Requests coalesce and results (including failures) are cached for 60 seconds. The subprocess has a 10-second deadline and is terminated after reading; no model turn is created.
- Weekly windows are identified by their duration, including when primary is weekly-only. Missing windows stay null; zero is a valid reading.
- The named `codex` bucket takes precedence over the backwards-compatible default bucket.
- No monetary spend is inferred from credits. `spend` is null.
- Missing CLI, missing subscription authentication, malformed output, or upstream failures return a disconnected snapshot. Providers with no data are hidden by the UI.
