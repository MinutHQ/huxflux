import { toast } from "sonner"
import { useAgentEvents } from "@huxflux/shared"
import { playSound } from "@/lib/sounds"
import { getSoundPref, getSoundEnabled, getDesktopNotif } from "@/lib/notificationPrefs"
import { sendDesktopNotification } from "@/lib/desktopNotifications"
import type { AgentSummary } from "@huxflux/shared"

/**
 * Global notification hook — call once at the app root.
 * Listens for message:done on all agents and fires a toast + sound.
 */
function fireNotification(title: string, body: string) {
  if (getSoundEnabled()) {
    playSound(getSoundPref())
  }

  if (getDesktopNotif()) {
    sendDesktopNotification(title, body).catch((error: unknown) => {
      console.warn("Could not send desktop notification:", error)
    })
  }
}

export function useNotifications(agents: AgentSummary[]) {
  useAgentEvents(null, (event) => {
    const agentId = (event as { agentId?: string }).agentId
    const agent = agentId ? agents.find((a) => a.id === agentId) : undefined
    const title = agent?.title ?? "Agent"

    // Segment closes (mid-run injection splits) are not the end of the turn.
    if (event.type === "message:done" && !event.segment) {
      toast.success(`${title} finished`, {
        description: "Claude has completed its response.",
        duration: 4000,
      })
      fireNotification(`${title} finished`, "Claude has completed its response.")
    }

    if (event.type === "ask:question") {
      const questions = (event as { questions?: Array<{ question: string }> }).questions
      const firstQuestion = questions?.[0]?.question ?? "Waiting for your input"
      toast(`${title} has a question`, {
        description: firstQuestion.length > 80 ? firstQuestion.slice(0, 80) + "..." : firstQuestion,
        duration: 10000,
      })
      fireNotification(`${title} needs your input`, firstQuestion)
    }
  })
}
