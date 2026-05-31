// Shared contract for background jobs.
//
// Each domain that needs periodic work (PR/CI monitoring, Jira sync, port
// cleanup, etc.) exports an object satisfying this interface from its own
// `domains/<x>/<x>.job.ts`. The registry in `src/jobs.ts` lists them
// alongside the domain plugins so the server entrypoint can start them all
// with one call.

export interface Job {
  /** Stable identifier — used in logs and (eventually) admin endpoints. */
  name: string
  /** Begin scheduling. Should be idempotent: starting twice is a programming
   * error, not a runtime crash. Jobs own their own timers and state. */
  start(): void
  /** Optional clean shutdown — currently unused; jobs run until process exit. */
  stop?(): void
}
