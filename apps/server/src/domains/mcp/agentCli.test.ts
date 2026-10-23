import { describe, expect, it } from "vitest"
import { AGENT_USAGE, parseAgentArgs } from "./agentCli.js"

describe("parseAgentArgs", () => {
  it("maps create flags to create_agent and keeps the repo for later resolution", () => {
    expect(parseAgentArgs(["create", "--title", "Flaky test", "--repo", "huxflux", "--status", "triage"])).toEqual({
      tool: "create_agent",
      args: { title: "Flaky test", status: "triage" },
      repo: "huxflux",
    })
  })

  it("maps status to set_agent_status", () => {
    expect(parseAgentArgs(["status", "abc", "triage"])).toEqual({
      tool: "set_agent_status",
      args: { agentId: "abc", status: "triage" },
    })
  })

  it("maps list with and without a status filter", () => {
    expect(parseAgentArgs(["list"])).toEqual({ tool: "list_agents", args: {} })
    expect(parseAgentArgs(["list", "--status", "triage"])).toEqual({ tool: "list_agents", args: { status: "triage" } })
  })

  it("maps get to get_agent", () => {
    expect(parseAgentArgs(["get", "abc"])).toEqual({ tool: "get_agent", args: { agentId: "abc" } })
  })

  it("rejects a missing subcommand or an unknown one with the usage text", () => {
    expect(() => parseAgentArgs([])).toThrow(AGENT_USAGE)
    expect(() => parseAgentArgs(["nope"])).toThrow(AGENT_USAGE)
  })

  it("rejects missing required arguments", () => {
    expect(() => parseAgentArgs(["create"])).toThrow("Missing --title")
    expect(() => parseAgentArgs(["status", "abc"])).toThrow("Missing status")
    expect(() => parseAgentArgs(["get"])).toThrow("Missing agent id")
  })

  it("rejects an unknown flag instead of throwing a raw parser error", () => {
    expect(() => parseAgentArgs(["list", "--bogus"])).toThrow(AGENT_USAGE)
  })
})
