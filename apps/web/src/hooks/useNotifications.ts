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

    if (getDesktopNotif()) {
      if (isTauri) {
        import("@tauri-apps/plugin-notification").then(({ sendNotification, isPermissionGranted, requestPermission }) => {
          isPermissionGranted().then(async (granted) => {
            if (!granted) {
              const permission = await requestPermission()
              if (permission !== "granted") return
            }
            sendNotification({ title: `${title} finished`, body: "Claude has completed its response." })
          })
        }).catch(() => {})
      } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`${title} finished`, { body: "Claude has completed its response." })
      }
    }
  })
}
