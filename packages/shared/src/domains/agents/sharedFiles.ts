// Files an agent hands to the user from its reply. The server copies each one
// into a per-agent store; clients render a download chip per entry on the
// assistant message and load it from the URL below.

import { getActiveServer, serverAuthedUrl } from "../servers/servers.store.js"

/** Largest file an agent can share, in bytes. Big enough for a release APK. */
export const MAX_SHARED_FILE_BYTES = 500 * 1024 * 1024

/** Authenticated download URL for a shared file on the active server, or null when offline. */
export function sharedFileUrl(agentId: string, file: string): string | null {
  const server = getActiveServer()
  if (!server) return null
  return serverAuthedUrl(server, `/api/agents/${encodeURIComponent(agentId)}/shared/${encodeURIComponent(file)}`)
}
