import { Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconBolt } from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import type { Agent } from "@huxflux/shared"

interface AgentSettingsPopoverProps {
  agent: Agent
}

interface MonitoringToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function MonitoringToggle({ label, checked, onChange }: MonitoringToggleProps) {
  return (
    <label className="flex items-center justify-between px-1 py-1 text-[12px] cursor-pointer">
      <span className="text-foreground/80">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
    </label>
  )
}

export function AgentSettingsPopover({ agent }: AgentSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-3 w-full px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-md transition-colors">
          <IconBolt size={15} className="text-muted-foreground shrink-0" />
          <span>Agent settings</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-56 p-2 space-y-2">
        <div className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide px-1">Monitoring</div>
        <MonitoringToggle
          label="PR comments"
          checked={agent.prCommentMonitoring !== 0}
          onChange={(checked) => {
            const val: boolean | null = checked ? null : false
            api.agents.update(agent.id, { prCommentMonitoring: val })
          }}
        />
        <MonitoringToggle
          label="CI failures"
          checked={agent.ciMonitoring !== 0}
          onChange={(checked) => {
            const val: boolean | null = checked ? null : false
            api.agents.update(agent.id, { ciMonitoring: val })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
