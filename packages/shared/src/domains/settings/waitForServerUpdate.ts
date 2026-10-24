import type { ServerVersionInfo } from "./settings.types.js"

export type ServerUpdateOutcome =
  | { status: "installed" }
  | { status: "failed"; error: string }

export interface WaitForServerUpdateOptions {
  intervalMs?: number
  timeoutMs?: number
}

/**
 * Poll the server after `POST /api/system/update` until its background install
 * finishes. Failed polls (the server restarting, a network blip) are retried
 * until the server answers again, so the outcome always comes from the server.
 * A server that does not report `updateInProgress` installed synchronously, so
 * its first answer is final.
 */
export async function waitForServerUpdate(
  getVersion: () => Promise<ServerVersionInfo>,
  { intervalMs = 2000, timeoutMs = 11 * 60 * 1000 }: WaitForServerUpdateOptions = {},
): Promise<ServerUpdateOutcome> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let info: ServerVersionInfo | null = null
    try {
      info = await getVersion()
    } catch {
      // Unreachable for now; keep polling until it answers or time runs out.
    }
    if (info && !info.updateInProgress) {
      return info.updateError ? { status: "failed", error: info.updateError } : { status: "installed" }
    }
    if (Date.now() >= deadline) {
      const error = info
        ? "Timed out waiting for the server update to finish"
        : "Lost contact with the server during the update"
      return { status: "failed", error }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
