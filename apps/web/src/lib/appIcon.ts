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

export async function setAppIcon(id: AppIconId) {
  await applyAppIcon(id)
  localStorage.setItem(KEY, id)
}

/** Reapply on startup too: app updates may replace the bundle's custom icon. */
export async function applyAppIcon(id: AppIconId) {
  if (isTauri && isMacOS) {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("set_app_icon", { icon: id })
  }
  const option = appIcons.find((i) => i.id === id)
  // Default keeps the multi-resolution favicon.ico; the PNG previews are only
  // used for non-default icons.
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) link.href = id === "default" ? "/favicon.ico" : (option?.preview ?? "/favicon.ico")
}
