// Composes every domain's api slice into one namespaced `api` object.
// Consumers import `{ api }` from `@huxflux/shared` and call
// `api.<domain>.<method>(...)`. Each slice lives in `domains/<name>/api.ts`.
//
// The namespaced shape removes collisions between domains and makes the
// owning domain obvious at every call site (e.g. `api.agents.update` vs
// `api.tasks.update` — both routes are `update`, but no ambiguity remains).

import { agentsApi } from "./domains/agents/agents.api.js"
import { settingsApi } from "./domains/settings/settings.api.js"
import { reposApi } from "./domains/repos/repos.api.js"
import { prsApi } from "./domains/pull-requests/pull-requests.api.js"
import { tasksApi } from "./domains/tasks/tasks.api.js"
import { wrappedApi } from "./domains/wrapped/wrapped.api.js"
import { automationsApi } from "./domains/automations/automations.api.js"

export const api = {
  agents: agentsApi,
  settings: settingsApi,
  repos: reposApi,
  prs: prsApi,
  tasks: tasksApi,
  wrapped: wrappedApi,
  automations: automationsApi,
}

export { getApiBase } from "./apiBase.js"
