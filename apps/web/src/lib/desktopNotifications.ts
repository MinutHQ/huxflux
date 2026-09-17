import { getAppName } from "./appName"
import { getAppIcon } from "./appIcon"
import { isTauri, isMacOS } from "./platform"

/** Used by agent events and the settings test, so both exercise the same path. */
export async function sendDesktopNotification(title: string, body: string): Promise<void> {
  if (isTauri) {
    if (isMacOS) {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("send_desktop_notification", { title, body, icon: getAppIcon(), name: getAppName() })
    } else {
      const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification")
      if (!await isPermissionGranted() && await requestPermission() !== "granted") {
        throw new Error("Enable notifications for this app in system settings first")
      }
      sendNotification({ title, body })
    }
  } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body })
  } else {
    throw new Error("Enable browser notifications first")
  }
}
