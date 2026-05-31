// Public re-export of the agent-runner tag handlers owned by the automations
// domain. Implementations live in `service/runnerTags.ts` (private subfolder).

export {
  automationTriggerHandler,
  automationStepHandler,
  automationRemoveHandler,
  automationConfigHandler,
} from "./service/runnerTags.js"
