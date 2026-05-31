import type { Automation } from "@huxflux/shared"

// Mock automations used during development. The list view and the workspace
// view both reference these so a fresh install has something to look at; the
// real records arrive from the server once they exist.

const baseTime = () => Date.now()

const MOCK_RESTAURANT: Automation = {
  id: "mock-restaurant",
  name: "Restaurant Availability Checker",
  description: "Checks restaurantX.com every hour for new dinner reservation slots on weekends and notifies via email when something opens up.",
  status: "active",
  schedule: "every 1h",
  steps: [
    { id: "s1", type: "trigger", label: "Every 1 hour", config: { interval: "1h" }, position: { x: 0, y: 0 }, connections: ["s2"] },
    { id: "s2", type: "fetch", label: "Fetch reservation page", config: { url: "https://restaurantx.com/reserve" }, position: { x: 0, y: 1 }, connections: ["s3"] },
    { id: "s3", type: "parse", label: "Extract available dates", config: { selector: ".date-slot" }, position: { x: 0, y: 2 }, connections: ["s4"] },
    { id: "s4", type: "compare", label: "Compare with previous", config: {}, position: { x: 0, y: 3 }, connections: ["s5"] },
    { id: "s5", type: "notify", label: "Email if new slots found", config: { channel: "email" }, position: { x: 0, y: 4 }, connections: [] },
  ],
  builderAgentId: null,
  lastRunAt: new Date(baseTime() - 25 * 60_000).toISOString(),
  lastRunStatus: "success",
  runCount: 47,
  runs: [
    { id: "r1", automationId: "mock-restaurant", status: "success", output: "No new slots found", error: null, startedAt: new Date(baseTime() - 25 * 60_000).toISOString(), finishedAt: new Date(baseTime() - 25 * 60_000 + 3200).toISOString() },
    { id: "r2", automationId: "mock-restaurant", status: "success", output: "No new slots found", error: null, startedAt: new Date(baseTime() - 85 * 60_000).toISOString(), finishedAt: new Date(baseTime() - 85 * 60_000 + 2800).toISOString() },
    { id: "r3", automationId: "mock-restaurant", status: "success", output: "Found 2 new slots: Sat 7pm, Sun 6pm. Notification sent.", error: null, startedAt: new Date(baseTime() - 145 * 60_000).toISOString(), finishedAt: new Date(baseTime() - 145 * 60_000 + 4100).toISOString() },
    { id: "r4", automationId: "mock-restaurant", status: "failure", output: null, error: "Timeout: page took >10s to load", startedAt: new Date(baseTime() - 205 * 60_000).toISOString(), finishedAt: new Date(baseTime() - 205 * 60_000 + 10200).toISOString() },
  ],
  createdAt: new Date(baseTime() - 7 * 86_400_000).toISOString(),
  updatedAt: new Date(baseTime() - 25 * 60_000).toISOString(),
}

const MOCK_PING: Automation = {
  id: "mock-ping",
  name: "API Health Monitor",
  description: "Pings the production API every 5 minutes and alerts if it returns non-200.",
  status: "active",
  schedule: "every 5m",
  steps: [
    { id: "p1", type: "trigger", label: "Every 5 minutes", config: { interval: "5m" }, position: { x: 0, y: 0 }, connections: ["p2"] },
    { id: "p2", type: "fetch", label: "GET /health", config: { url: "https://api.example.com/health" }, position: { x: 0, y: 1 }, connections: ["p3"] },
    { id: "p3", type: "compare", label: "Check status code", config: { expect: 200 }, position: { x: 0, y: 2 }, connections: ["p4"] },
    { id: "p4", type: "notify", label: "Alert if down", config: { channel: "in-app" }, position: { x: 0, y: 3 }, connections: [] },
  ],
  builderAgentId: null,
  lastRunAt: new Date(baseTime() - 3 * 60_000).toISOString(),
  lastRunStatus: "success",
  runCount: 312,
  runs: [
    { id: "pr1", automationId: "mock-ping", status: "success", output: "200 OK (142ms)", error: null, startedAt: new Date(baseTime() - 3 * 60_000).toISOString(), finishedAt: new Date(baseTime() - 3 * 60_000 + 500).toISOString() },
    { id: "pr2", automationId: "mock-ping", status: "success", output: "200 OK (98ms)", error: null, startedAt: new Date(baseTime() - 8 * 60_000).toISOString(), finishedAt: new Date(baseTime() - 8 * 60_000 + 400).toISOString() },
  ],
  createdAt: new Date(baseTime() - 14 * 86_400_000).toISOString(),
  updatedAt: new Date(baseTime() - 3 * 60_000).toISOString(),
}

const MOCK_PRICE: Automation = {
  id: "mock-price",
  name: "Price Drop Watcher",
  description: "Monitors product prices on a shopping site and notifies when they drop below a threshold.",
  status: "paused",
  schedule: "every 6h",
  steps: [
    { id: "d1", type: "trigger", label: "Every 6 hours", config: { interval: "6h" }, position: { x: 0, y: 0 }, connections: ["d2"] },
    { id: "d2", type: "fetch", label: "Scrape product page", config: {}, position: { x: 0, y: 1 }, connections: ["d3"] },
    { id: "d3", type: "parse", label: "Extract price", config: {}, position: { x: 0, y: 2 }, connections: ["d4"] },
    { id: "d4", type: "compare", label: "Below threshold?", config: { threshold: 50 }, position: { x: 0, y: 3 }, connections: ["d5"] },
    { id: "d5", type: "notify", label: "Send alert", config: {}, position: { x: 0, y: 4 }, connections: [] },
  ],
  builderAgentId: null,
  lastRunAt: new Date(baseTime() - 2 * 86_400_000).toISOString(),
  lastRunStatus: "success",
  runCount: 8,
  runs: [],
  createdAt: new Date(baseTime() - 5 * 86_400_000).toISOString(),
  updatedAt: new Date(baseTime() - 2 * 86_400_000).toISOString(),
}

export const MOCK_AUTOMATIONS: Automation[] = [MOCK_RESTAURANT, MOCK_PING, MOCK_PRICE]

export const MOCK_AUTOMATIONS_BY_ID: Record<string, Automation> = {
  "mock-restaurant": MOCK_RESTAURANT,
  "mock-ping": MOCK_PING,
  "mock-price": MOCK_PRICE,
}
