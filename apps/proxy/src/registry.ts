import type { Tunnel } from "./tunnel.js"
import { logger } from "./logger.js"

// Registry of connected servers, namespaced by owning user. A client can only
// reach a server registered under the client's own email, so two different
// users may use the same serverId without colliding, and neither can see the
// other's servers.
const tunnels = new Map<string, Tunnel>()

function keyFor(email: string, serverId: string): string {
  return `${email}\n${serverId}`
}

export function registerTunnel(email: string, serverId: string, tunnel: Tunnel): void {
  const key = keyFor(email, serverId)
  const existing = tunnels.get(key)
  if (existing && existing !== tunnel) {
    logger.warn(`server ${serverId} (${email}) re-registered; dropping previous tunnel`)
    existing.close(1012, "replaced by new registration")
  }
  tunnels.set(key, tunnel)
}

export function unregisterTunnel(email: string, serverId: string, tunnel: Tunnel): void {
  const key = keyFor(email, serverId)
  if (tunnels.get(key) === tunnel) tunnels.delete(key)
}

/** Look up a server owned by `email`. Returns undefined if none (or it belongs
 * to a different user, which is indistinguishable from absent by design). */
export function getTunnel(email: string, serverId: string): Tunnel | undefined {
  return tunnels.get(keyFor(email, serverId))
}

export function tunnelCount(): number {
  return tunnels.size
}
