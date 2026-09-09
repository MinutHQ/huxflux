import { useCallback, useState } from "react"
import { cn } from "@huxflux/ui"
import { IconArrowsMinimize } from "@tabler/icons-react"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import type { Agent } from "@huxflux/shared"
import { isHeadroomOn } from "../utils"
import { HeadroomInstallDialog } from "../dialogs/HeadroomInstallDialog"

interface HeadroomToggleProps {
  agent: Agent
}

/**
 * Composer toolbar toggle for routing this agent's Claude process through the
 * Headroom compression proxy. Same visual language as the Plan button: lit
 * when on. When the CLI is missing on the server, clicking opens the install
 * dialog instead of flipping the flag; a successful install turns it on.
 */
export function HeadroomToggle({ agent }: HeadroomToggleProps) {
  const [installOpen, setInstallOpen] = useState(false)
  const { data: status } = useHuxfluxQuery({
    queryKey: queryKeys.headroom.status(),
    queryFn: api.headroom.status,
    staleTime: 30_000,
  })
  const on = isHeadroomOn(agent)
  const installed = status?.installed ?? true
  const title = !installed && !on
    ? "Headroom is not installed on the server. Click to install."
    : on
      ? "Headroom compression on: this agent's requests go through the local Headroom proxy"
      : "Route this agent through the Headroom compression proxy"

  const turnOn = useCallback(() => { api.agents.update(agent.id, { headroom: true }) }, [agent.id])

  return (
    <>
      <button
        onClick={() => {
          if (!installed && !on) setInstallOpen(true)
          else api.agents.update(agent.id, { headroom: !on })
        }}
        title={title}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
          on ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground/60",
          !installed && !on && "opacity-70",
        )}
      >
        <IconArrowsMinimize size={13} />
        <span>Headroom</span>
      </button>
      <HeadroomInstallDialog open={installOpen} onOpenChange={setInstallOpen} onInstalled={turnOn} />
    </>
  )
}
