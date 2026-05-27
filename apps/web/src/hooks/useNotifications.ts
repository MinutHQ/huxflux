import { toast } from "sonner"
import { useAgentEvents } from "@huxflux/shared"
import { playSound } from "@/lib/sounds"
import { getSoundPref, getSoundEnabled, getDesktopNotif } from "@/lib/notificationPrefs"
import { isTauri } from "@/lib/platform"
import type { AgentSummary } from "@/data/mock"

/**
 * Global notification hook — call once at the app root.
 * Listens for message:done on all agents and fires a toast + sound.
 */
function fireNotification(title: string, body: string) {
  if (getSoundEnabled()) {
    playSound(getSoundPref())
  }

  if (getDesktopNotif()) {
    if (isTauri) {
      import("@tauri-apps/plugin-notification").then(({ sendNotification, isPermissionGranted, requestPermission }) => {
        isPermissionGranted().then(async (granted) => {
          if (!granted) {
            const permission = await requestPermission()
            if (permission !== "granted") return
          }
          sendNotification({ title, body })
        })
      }).catch(() => {})
    } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body })
    }
  }
}

export function useNotifications(agents: AgentSummary[]) {
  useAgentEvents(null, (event) => {
    const agentId = (event as { agentId?: string }).agentId
    const agent = agentId ? agents.find((a) => a.id === agentId) : undefined
    const title = agent?.title ?? "Agent"

    if (event.type === "message:done") {
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
