import type { FastifyPluginAsync } from "fastify"
import { agentsPlugin } from "./agents/agents.routes.js"
import { automationsPlugin } from "./automations/automations.routes.js"
import { reposPlugin } from "./repos/repos.routes.js"
import { settingsPlugin } from "./settings/settings.routes.js"
import { wrappedPlugin } from "./wrapped/wrapped.routes.js"
import { feedbackPlugin } from "./feedback/feedback.routes.js"
import { pullRequestsPlugin } from "./pull-requests/pull-requests.routes.js"
import { tasksPlugin } from "./tasks/tasks.routes.js"

// Future server domains append here as they extract. The server entrypoint
// loops over this array, so adding a domain is a one-line change at this
// registry plus the domain's own folder.
//
// This file (`apps/server/src/domains/index.ts`) is the cross-domain plugin
// registry — NOT a per-domain barrel. The new public-surface convention
// removed per-domain `index.ts` files; the registry stays because it has a
// distinct role (it composes domains, not exposes one).
export const domainPlugins: FastifyPluginAsync[] = [
  agentsPlugin,
  automationsPlugin,
  reposPlugin,
  settingsPlugin,
  wrappedPlugin,
  feedbackPlugin,
  pullRequestsPlugin,
  tasksPlugin,
]
