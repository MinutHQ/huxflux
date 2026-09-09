# headroom

Cross-platform contract for the Headroom context-compression integration: proxy status on the server machine and per-agent savings figures.

## Owns

- The response schemas for `GET /api/headroom/status`, `GET /api/headroom/agents/:agentId/stats`, and `POST /api/headroom/install`.
- The `headroomApi` client slice composed into `api.headroom`.

## Public surface

- `headroom.types.ts`: `headroomStatusSchema` / `HeadroomStatus` (includes `install` progress and `canInstall`), `headroomInstallStateSchema` / `HeadroomInstallState`, `headroomAgentStatsSchema` / `HeadroomAgentStats` (plus the nested `HeadroomAgentSavings` and `HeadroomProxyCache`).
- `headroom.api.ts`: `headroomApi.status()`, `headroomApi.agentStats(agentId)`, `headroomApi.install()`.

## Depends on

Zod and the shared validated HTTP client.

## Sub-domains

None.

## Quirks

- `agent` is null until the agent has sent at least one request through the proxy, and can become null again later because the proxy keeps at most 50 per-project rows and evicts the smallest/oldest.
- `proxy` cache figures are proxy-wide, not per agent.
