# feedback

The in-app "send feedback" button posts user-supplied title + body to a configured GitHub issue tracker. The server proxies that request so the GitHub token never leaves the host.

## Owns

- The `/api/feedback` REST surface: POST title (required) and optional body. The server validates env config (`FEEDBACK_REPO` + `GITHUB_TOKEN`), splits the `owner/repo` string, and forwards to `pull-requests.createIssue` with a `feedback` label

## Public surface

- `feedback.routes.ts` — exposes `feedbackPlugin`, the Fastify plugin registering POST `/api/feedback`. Wired through the registry at `src/domains/index.ts`.

## Depends on

- `src/config.ts` — `feedbackRepo`, `githubToken`
- `src/domains/pull-requests/misc.ts` — `createIssue`
- `fastify` — runtime

## Sub-domains

None.

## Quirks

- Returns 503 (not 400) when the server isn't configured — feedback is an optional capability, and the client treats 503 as "feature disabled, hide the button" rather than "your request was bad".
- The split between `FEEDBACK_REPO not set`, `GITHUB_TOKEN not set`, and `must be in owner/repo format` is preserved from the source so the client can show different messages.
