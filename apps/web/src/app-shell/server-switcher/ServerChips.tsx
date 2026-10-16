import { ServerAvatar } from "./ServerAvatar"
import { ServerSwitcher } from "./ServerSwitcher"
import { useSwitcherServers } from "./useSwitcherServers"

/**
 * The classic footer trigger for the active server, followed by small
 * one-click chips for every other server, each carrying its own badge.
 */
export function ServerChips() {
  const { servers, activeServer, statuses, attention, setActive, update } = useSwitcherServers()
  const others = servers.filter((s) => s.id !== activeServer?.id)
  return (
    <div className="flex items-center min-w-0">
      <div className="flex-1 min-w-0">
        <ServerSwitcher compact />
      </div>
      <div className="flex items-center gap-2 pr-1 shrink-0">
        {others.map((server) => (
          <ServerAvatar
            key={server.id}
            server={server}
            status={statuses[server.id] ?? "checking"}
            attention={attention[server.id]}
            isActive={false}
            onSelect={() => setActive(server.id)}
            onChangeAppearance={(patch) => update(server.id, patch)}
            tooltipSide="top"
            size="lg"
          />
        ))}
      </div>
    </div>
  )
}
