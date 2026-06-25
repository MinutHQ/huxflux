import { describe, it, expect } from "vitest"
import { mapUsageResponse } from "./claude-usage.service.js"

describe("mapUsageResponse", () => {
  it("maps the five_hour and seven_day windows to session and weekly", () => {
    const usage = mapUsageResponse({
      five_hour: {
        utilization: 45,
        resets_at: "2026-06-25T17:29:59.319123+00:00",
      },
      seven_day: {
        utilization: 55,
        resets_at: "2026-06-26T23:59:59.319143+00:00",
      },
    })

    expect(usage).toEqual({
      connected: true,
      session: { utilization: 45, resetsAt: "2026-06-25T17:29:59.319123+00:00" },
      weekly: { utilization: 55, resetsAt: "2026-06-26T23:59:59.319143+00:00" },
      error: null,
    })
  })

  it("yields a null window when one is omitted", () => {
    const usage = mapUsageResponse({
      five_hour: { utilization: 10, resets_at: "2026-06-25T17:29:59Z" },
    })

    expect(usage.session).toEqual({ utilization: 10, resetsAt: "2026-06-25T17:29:59Z" })
    expect(usage.weekly).toBeNull()
    expect(usage.connected).toBe(true)
  })

  it("yields a null window when a field is the wrong type or missing", () => {
    const usage = mapUsageResponse({
      five_hour: { utilization: null, resets_at: "2026-06-25T17:29:59Z" },
      seven_day: { utilization: 55, resets_at: null },
    })

    expect(usage.session).toBeNull()
    expect(usage.weekly).toBeNull()
  })
})
