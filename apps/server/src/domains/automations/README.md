# automations

The server-side surface for scheduled and event-driven automation pipelines: HTTP CRUD for automation records and their run history, the in-process scheduler that fires `executeAutomation` on each automation's cadence, the step runners (HTTP fetch, parse, transform, compare, conditional, notify, browser) that execute one pipeline end to end, the `<huxflux:automations.*>` tag handlers used by the builder agent to mutate an automation's flow graph from chat output, and the builder system prompt.

## Owns

- HTTP plugin: GET/POST/PUT/DELETE `/api/automations`, plus `/run`, `/runs`, and `/reply` sub-routes
- Drizzle tables `automations`, `automationRuns`, `automationSkills` (re-exported by `src/db/schema.ts`)
- In-memory scheduler timers (`scheduledTimers` Map) and the `executeAutomation` runner
- Step implementations in `service/runners.ts`: trigger, fetch, parse, transform, compare, conditional, notify, browser
- The agent-runner tag handlers in `service/runnerTags.ts` (`automations.trigger`, `automations.step`, `automations.remove`, `automations.config`), exported via `runnerTags.ts`
- The builder system prompt in `service/prompt.ts`
- The `AutomationsServerEvent` WebSocket event union (`automation:created`, `automation:updated`, `automation:deleted`, `automation:run-started`, `automation:run-completed`, `automation:notification`)

## Public surface

- `automationsPlugin`: Fastify plugin that registers `/api/automations/*`
- `startScheduler`: read every active+scheduled automation row on boot and start its timer
- `automationTriggerHandler`, `automationStepHandler`, `automationRemoveHandler`, `automationConfigHandler` (via `runnerTags.ts`): factories returning `TagHandler` entries that `runAgent` consumers can register to apply `<huxflux:automations.*>` directives to the linked automation row
- `automationsWs`: typed event-builder callable (broadcast-only); used by the runners and the routes plugin
- `AutomationsServerEvent`: the discriminated union of every automation event; composed into the central `ServerEvent` in `src/ws/events.ts`

## Depends on

- `fastify`: HTTP plugin
- `uuid`: generates automation, run, and builder-agent ids
- `drizzle-orm`: query builder for the automations + runs tables
- `node:os`: home-directory resolution for the no-worktree builder agent
- `../../db/index.js`: shared Drizzle handle
- `../../db/schema.js`: cross-domain `agents` table (the builder agent row)
- `../ws/define.js`: `defineEvents` / `InferEvents` for the WS event union
- `../settings/settings.service.js`: `getSettings` (default model + provider for the builder agent)
- `../agent-runner/agent-runner.service.js`: `runAgent` for kicking off the builder agent on the first `/reply`
- `../agent-runner/agent-runner.types.js`: `TagHandler` type, implemented by `runnerTags.ts`
- Optional runtime deps installed on demand: `nodemailer` (notify step, email channel), `agent-browser` CLI (browser step)

## Sub-domains

None.

## Quirks

- `executeAutomation` swallows step errors and persists a `"failure"` run record with the message. The thrown error never escapes the timer, so a single bad run does not stop the schedule.
- `service/runners.ts` uses `new Function(...)` to evaluate `transform.expression` and `conditional.condition`. The eval scope is just `output`, so it cannot reach anything else, but it is genuinely arbitrary code and runs in the server process. The current design treats automation authoring as a trusted operation (only the local user can create one).
- `service/runnerTags.ts` is the bridge between the agent-runner domain and this one: the builder route registers the four handler factories with `runAgent`, and the runner's generic `tagParser.ts` calls each handler when it sees a matching `<huxflux:automations.*>` directive in the assistant's message. Each handler reads the automation linked via `builderAgentId`, applies its mutation, and emits `automationsWs.automationUpdated`.
- The schema re-export in `src/db/schema.ts` is preserved as a barrel so the rest of the codebase keeps importing `automations` / `automationRuns` / `automationSkills` from `@/db/schema` without caring about the owning domain.
- The cross-domain `agents` table is read directly from the schema barrel rather than through any agents-domain top-level file. This matches the convention established by `git`, `repos`, and `pull-requests`: Drizzle table objects flow through `db/schema.ts`, only behavior flows through specific top-level files in the owning domain.
