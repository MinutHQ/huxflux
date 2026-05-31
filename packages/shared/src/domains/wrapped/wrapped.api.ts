import { reqValidated } from "../../apiBase.js"
import { wrappedSummarySchema } from "./wrapped.types.js"

export const wrappedApi = {
  // Singular endpoint — "current" rather than "list" since the response is a
  // single summary derived from query params, not a collection.
  current: (period: string, from?: string, to?: string, refresh?: boolean, length?: "short" | "medium" | "long") => {
    const params = new URLSearchParams({ period })
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    if (refresh) params.set("refresh", "true")
    if (length) params.set("length", length)
    // Claude summary generation can take 20–30s; give it headroom.
    return reqValidated(wrappedSummarySchema, `/api/wrapped?${params}`, { timeoutMs: 60_000 })
  },
}
