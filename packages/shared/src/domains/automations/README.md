# automations (shared)

Cross-platform Zod schemas and HTTP slice for the server-side automations subsystem.

## Owns

- The `Automation`, `AutomationStep`, `AutomationRun`, `AutomationSkill`, `AutomationStatus` Zod schemas (and inferred types) that mirror the server's JSON output for scheduled automation runs.
- The request-body schemas (`createAutomationBodySchema`, `updateAutomationBodySchema`, `replyToAutomationBuilderBodySchema`) used by both the client api slice and the server routes.
- The `automationsApi` slice that talks to `/api/automations/*` and validates every JSON response against the matching entity schema.

## Public surface

- `automationsApi` — HTTP slice spread into the composed `api` object.
- `automationSchema` — Zod schema for the top-level automation record; `Automation` is its inferred type.
- `automationStatusSchema` — Zod enum schema for automation lifecycle state; `AutomationStatus` is its inferred type.
- `automationStepSchema` — Zod schema for a single node in the automation graph; `AutomationStep` is its inferred type.
- `automationStepTypeSchema` — Zod enum schema for the step-type discriminator; `AutomationStepType` is its inferred type.
- `automationRunSchema` — Zod schema for a single execution record; `AutomationRun` is its inferred type.
- `automationRunStatusSchema` — Zod enum schema for run status; `AutomationRunStatus` is its inferred type.
- `automationSkillSchema` — Zod schema for a registered reusable skill script; `AutomationSkill` is its inferred type.
- `createAutomationBodySchema` — Zod schema for the create-automation request body; `CreateAutomationBody` is its inferred type.
- `updateAutomationBodySchema` — Zod schema for the update-automation (PUT) request body; `UpdateAutomationBody` is its inferred type.
- `replyToAutomationBuilderBodySchema` — Zod schema for the reply-to-builder request body; `ReplyToAutomationBuilderBody` is its inferred type.
- `Automation` — top-level automation record (name, schedule, steps, runs).
- `AutomationStep` — single node in the automation graph.
- `AutomationStepType` — step-type discriminator union.
- `AutomationRun` — single execution record (status + output / error).
- `AutomationRunStatus` — run status union (`"running" | "success" | "failure"`).
- `AutomationSkill` — registered reusable skill script.
- `AutomationStatus` — `"draft" | "active" | "paused" | "error"`.
- `CreateAutomationBody` — request body for `POST /api/automations`.
- `UpdateAutomationBody` — request body for `PUT /api/automations/:id`.
- `ReplyToAutomationBuilderBody` — request body for `POST /api/automations/:id/reply`.

## Depends on

- `../../apiBase` for the shared HTTP helpers.
- `zod` for the runtime schemas.

## Sub-domains

None.

## Quirks

- The server-side automations code lives in `apps/server/src/domains/automations/` as a proper domain. The schemas here mirror the HTTP shape, not the server-internal one, so they stay stable independent of how the server domain is organized.
- The server keeps a local `automations.types.ts` mirror so the runner code can avoid pulling all of `@huxflux/shared` (the historical reason was Node16 CJS resolution against the ESM-only tokens package). The server routes now import the request-body schemas directly from `@huxflux/shared` for validation, while internal services continue to use the local interface types.
- The `runs` array on `Automation` is loaded by the server when fetching a single automation, but list-style responses (`GET /api/automations`) return it empty for payload-size reasons. Consumers must not assume runs are populated in list responses.
- The server returns rows directly from Drizzle, which means columns the schema does not list (e.g. `stepsJson`, `scriptPath`, `stateJson`) are also present on the wire. Zod's default behavior strips unknown keys, which is what we want.
- The update body's `stepsJson` field is the raw stringified JSON of the steps array — the server stores it as-is and parses it on read. Callers building automations programmatically should `JSON.stringify(steps)` themselves.
