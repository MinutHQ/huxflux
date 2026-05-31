// Public re-export of the agent-runner tag handlers owned by the agents
// domain. Implementations live in `service/runnerTags.ts` (private subfolder).
//
// Each factory returns a `TagHandler` consumable by `runAgent`. Call sites in
// other domains (chat, automations, tasks, refine) compose these handlers
// inline so the runner stays domain-agnostic.

export {
  agentTitleHandler,
  agentBranchHandler,
  agentDelegateHandler,
  agentSpawnHandler,
} from "./service/runnerTags.js"
