import { isTauri, isMacOS } from "./platform"

export type AppIconId = "default" | "ship"

export interface AppIconOption {
  id: AppIconId
  name: string
  // Served from apps/web/public/app-icons/. Used for the settings preview and
  // as the browser favicon when selected.
  preview: string
}

export const appIcons: AppIconOption[] = [
  { id: "default", name: "Huxflux", preview: "/app-icons/default.png" },
  { id: "ship", name: "Ship it", preview: "/app-icons/ship.png" },
]

const KEY = "huxflux:app-icon"

export function getAppIcon(): AppIconId {
  const stored = localStorage.getItem(KEY)
  return appIcons.some((i) => i.id === stored) ? (stored as AppIconId) : "default"
}

export function setAppIcon(id: AppIconId) {
  localStorage.setItem(KEY, id)
  applyAppIcon(id)
}

/** Call once at startup and on every change. Swaps the favicon, and the dock
 *  icon when running in the macOS desktop app. */
export function applyAppIcon(id: AppIconId) {
  const option = appIcons.find((i) => i.id === id)
  // Default keeps the multi-resolution favicon.ico; the PNG previews are only
  // used for non-default icons.
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) link.href = id === "default" ? "/favicon.ico" : (option?.preview ?? "/favicon.ico")
  if (isTauri && isMacOS) {
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_app_icon", { icon: id }))
  }
}
