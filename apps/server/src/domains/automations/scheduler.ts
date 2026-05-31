// Public re-export of the automations scheduler. Implementation lives in
// `service/scheduler.ts` (private subfolder). Called once on server boot from
// `apps/server/src/index.ts`.

export { startScheduler } from "./service/scheduler.js"
