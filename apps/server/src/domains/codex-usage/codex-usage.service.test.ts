import { describe, expect, it } from "vitest"
import { mapCodexUsage } from "./codex-usage.service.js"

const session = { usedPercent: 100, windowDurationMins: 300, resetsAt: 1_800_000_000 }
const weekly = { usedPercent: 29, windowDurationMins: 10080, resetsAt: 1_800_100_000 }

describe("mapCodexUsage", () => {
  it("normalizes session and weekly readings and converts seconds to ISO timestamps", () => {
    expect(mapCodexUsage({ rateLimits: { primary: session, secondary: weekly } })).toEqual({
      connected: true,
      session: { utilization: 100, resetsAt: "2027-01-15T08:00:00.000Z" },
      weekly: { utilization: 29, resetsAt: "2027-01-16T11:46:40.000Z" },
      spend: null, reason: null, error: null,
    })
  })
  it("recognizes weekly-only accounts without presenting a weekly limit as a session", () => {
    const usage = mapCodexUsage({ rateLimits: { primary: weekly } })
    expect(usage.session).toBeNull()
    expect(usage.weekly?.utilization).toBe(29)
  })
  it("prefers the codex bucket over an unrelated default bucket", () => {
    const usage = mapCodexUsage({ rateLimits: { primary: session }, rateLimitsByLimitId: { codex: { primary: { ...session, usedPercent: 0 } } } })
    expect(usage.session?.utilization).toBe(0)
  })
  it("leaves absent windows absent", () => {
    expect(mapCodexUsage({}).session).toBeNull()
    expect(mapCodexUsage({ rateLimits: { primary: null, secondary: null } }).weekly).toBeNull()
  })
  it.each([NaN, Infinity, -1, 101])("rejects invalid utilization %s", (usedPercent) => {
    expect(() => mapCodexUsage({ rateLimits: { primary: { ...session, usedPercent } } })).toThrow()
  })
  it("rejects invalid timestamps", () => {
    expect(() => mapCodexUsage({ rateLimits: { primary: { ...session, resetsAt: 1e20 } } })).toThrow()
  })
})
