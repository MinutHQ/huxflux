import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import type { SlashCommand } from "@huxflux/shared"
import { cn } from "@huxflux/ui"
import shipItImage from "../assets/ship-it.png"

/** Prefer an exact `ship` skill, then a `ship*` prefix, then the first remaining skill whose name contains "ship". */
function pickShipCommand(commands: SlashCommand[]): SlashCommand | undefined {
  const skills = commands.filter((c) => c.source === "skill" && c.name.toLowerCase().includes("ship"))
  return skills.find((c) => c.name === "ship")
    ?? skills.find((c) => c.name.toLowerCase().startsWith("ship"))
    ?? skills[0]
}

interface ShipButtonProps {
  agentId: string
  disabled: boolean
  onSendCommand: (text: string) => void
}

/** Sends `/<ship-skill>` with one click. Renders nothing when the agent has no ship-like skill. */
export function ShipButton({ agentId, disabled, onSendCommand }: ShipButtonProps) {
  const { data: commands = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.slashCommands(agentId, "ship"),
    queryFn: () => api.agents.slashCommands(agentId, "ship"),
    staleTime: 5 * 60_000,
  })
  const command = pickShipCommand(commands)
  if (!command) return null

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSendCommand(`/${command.name}`)}
      title={`/${command.name}`}
      aria-label={`Run /${command.name}`}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-all hover:bg-accent hover:scale-110",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <img src={shipItImage} alt="" className="size-7" draggable={false} />
    </button>
  )
}
