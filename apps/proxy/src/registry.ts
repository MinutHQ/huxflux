import type { Tunnel } from "./tunnel.js"
import { logger } from "./logger.js"

// Registry of connected servers by id. Supports many concurrent servers; a new
// registration for an already-connected id replaces the old tunnel (the old
// server process is assumed dead or reconnecting).
const tunnels = new Map<string, Tunnel>()

export function registerTunnel(serverId: string, tunnel: Tunnel): void {
  const existing = tunnels.get(serverId)
  if (existing && existing !== tunnel) {
    logger.warn(`server ${serverId} re-registered; dropping previous tunnel`)
    existing.close(1012, "replaced by new registration")
  }
  tunnels.set(serverId, tunnel)
}

export function unregisterTunnel(serverId: string, tunnel: Tunnel): void {
  // Only remove if this exact tunnel is still the active one — guards against a
  // late close event from a tunnel that was already replaced.
  if (tunnels.get(serverId) === tunnel) tunnels.delete(serverId)
}

export function getTunnel(serverId: string): Tunnel | undefined {
  return tunnels.get(serverId)
}

export function tunnelCount(): number {
  return tunnels.size
}
