import type { ServerStatus } from "@huxflux/shared"

// Status hues are Tailwind palette colors on purpose (see StatusDot): they
// must read the same in light and dark themes.
export const STATUS_DOT_CLASS: Record<ServerStatus, string> = {
  online: "bg-emerald-400",
  offline: "bg-red-400",
  checking: "bg-amber-400 animate-pulse",
  unauthorized: "bg-amber-400",
}

export const STATUS_LABEL: Record<ServerStatus, string> = {
  online: "Online",
  offline: "Offline",
  checking: "Checking...",
  unauthorized: "Unauthorized",
}
