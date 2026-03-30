import { toast } from "sonner"
import { useAgentEvents } from "@/lib/ws"
import { playSound } from "@/lib/sounds"
import { getSoundPref, getSoundEnabled } from "@/lib/notificationPrefs"
import type { AgentSummary } from "@/data/mock"

/**
 * Global notification hook — call once at the app root.
 * Listens for message:done on all agents and fires a toast + sound.
 */
export function useNotifications(agents: AgentSummary[]) {
  useAgentEvents(null, (event) => {
    if (event.type !== "message:done") return

    const agentId = (event as { agentId?: string }).agentId
    const agent = agentId ? agents.find((a) => a.id === agentId) : undefined
    const title = agent?.title ?? "Agent"

    toast.success(`${title} finished`, {
      description: "Claude has completed its response.",
      duration: 4000,
    })

    if (getSoundEnabled()) {
      playSound(getSoundPref())
    }
  })
}
