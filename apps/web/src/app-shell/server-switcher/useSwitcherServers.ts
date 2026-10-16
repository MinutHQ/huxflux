import { useServerAttention, useServerStatus, type ServerAttention } from "@huxflux/shared"
import { useServers } from "@/hooks/useServers"

/**
 * Everything a switcher layout renders from: the server list, live status,
 * per-server attention, and `othersAttention` (the sum over non-active
 * servers) for an aggregate badge.
 */
export function useSwitcherServers() {
  const { servers, activeServer, setActive, update } = useServers()
  const statuses = useServerStatus(servers)
  const attention = useServerAttention(servers)

  const othersAttention: ServerAttention = { waiting: 0, unread: 0, items: [] }
  for (const s of servers) {
    const a = attention[s.id]
    if (!a || s.id === activeServer?.id) continue
    othersAttention.waiting += a.waiting
    othersAttention.unread += a.unread
  }

  return { servers, activeServer, statuses, attention, othersAttention, setActive, update }
}
