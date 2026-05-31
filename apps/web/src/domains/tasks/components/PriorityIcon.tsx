import { cn } from "@huxflux/ui"
import { PRIORITY_CONFIG } from "../config"

export function PriorityIcon({
  priority,
  size = 12,
}: {
  priority: string
  size?: number
}) {
  const config = PRIORITY_CONFIG[priority]
  if (!config) return null
  const Icon = config.icon
  return <Icon size={size} className={cn(config.color, "shrink-0")} />
}
