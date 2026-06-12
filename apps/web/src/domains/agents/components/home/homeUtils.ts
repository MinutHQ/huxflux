// Helpers internal to the home dashboard. The visible statuses array here
// includes "cancelled" because the home dashboard shows it in the by-status
// breakdown, unlike the sidebar list which hides cancelled rows by default.

import type { AgentStatus } from "@huxflux/shared"

export const homeVisibleStatuses: AgentStatus[] = ["done", "in-review", "draft-pr", "in-progress", "backlog", "cancelled"]

/** Compact integer formatting (1.2k, 3.4M) for big stats. */
export function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export type WrappedPeriod = "wtd" | "last-week" | "last-month" | "last-year" | "custom"
export type WrappedLength = "short" | "medium" | "long"

export const wrappedPeriodLabels: Record<WrappedPeriod, string> = {
  wtd: "This week",
  "last-week": "Last week",
  "last-month": "Last month",
  "last-year": "Last year",
  custom: "Custom",
}

export const wrappedLengthLabels: Record<WrappedLength, string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
}
