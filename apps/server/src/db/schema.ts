// Drizzle table re-exports.
//
// Tables now live per-domain in `src/domains/<x>/db.ts`. This file is a
// backward-compatible barrel so existing `from "@/db/schema"` imports keep
// working. The centralized migration history stays in `src/db/index.ts`.
// New code may import directly from a domain's `db.ts`, or from this barrel
// when it needs tables from multiple domains.

export { repos } from "../domains/repos/repos.db.js"
export {
  agents,
  agentPorts,
  worktreePool,
  messages,
  toolCalls,
  fileChanges,
  terminalLines,
  terminalTabs,
} from "../domains/agents/agents.db.js"
export { wrappedSummaries } from "../domains/wrapped/wrapped.db.js"
export { tasks, taskAgents, taskComments, taskDependencies } from "../domains/tasks/tasks.db.js"
export { automations, automationRuns, automationSkills } from "../domains/automations/automations.db.js"
