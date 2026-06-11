import { afterEach, describe, expect, it } from "vitest"
import { registerSocket, onAgentSubscription } from "./handler.js"

/**
 * Minimal fake socket mirroring the surface `registerSocket` touches. Tests
 * drive `subscribe`/`unsubscribe` frames through `message` and tear down via
 * `close`, then assert the subscription-lifecycle listener fired correctly.
 */
function makeSocket() {
  const messageHandlers: Array<(raw: string) => void> = []
  const closeHandlers: Array<() => void> = []
  const socket = {
    readyState: 1,
    OPEN: 1,
    send: () => {},
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (event === "message") messageHandlers.push(handler as (raw: string) => void)
      else if (event === "close") closeHandlers.push(handler as () => void)
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerSocket(socket as any)
  return {
    subscribe: (agentId: string) => messageHandlers.forEach((h) => h(JSON.stringify({ type: "subscribe", agentId }))),
    unsubscribe: (agentId: string) => messageHandlers.forEach((h) => h(JSON.stringify({ type: "unsubscribe", agentId }))),
    close: () => closeHandlers.forEach((h) => h()),
  }
}

describe("onAgentSubscription", () => {
  let disposeListener: (() => void) | null = null
  const sockets: Array<ReturnType<typeof makeSocket>> = []
  let calls: Array<{ agentId: string; active: boolean }>

  function track() {
    calls = []
    disposeListener = onAgentSubscription((agentId, active) => calls.push({ agentId, active }))
  }
  function socket() {
    const s = makeSocket()
    sockets.push(s)
    return s
  }

  afterEach(() => {
    for (const s of sockets) s.close()
    sockets.length = 0
    disposeListener?.()
    disposeListener = null
  })

  it("fires active=true on the first subscriber and active=false on the last unsubscribe", () => {
    track()
    const s = socket()

    s.subscribe("agent-A")
    expect(calls).toEqual([{ agentId: "agent-A", active: true }])

    s.unsubscribe("agent-A")
    expect(calls).toEqual([
      { agentId: "agent-A", active: true },
      { agentId: "agent-A", active: false },
    ])
  })

  it("does not re-fire active=true for a duplicate subscribe from the same socket", () => {
    track()
    const s = socket()

    s.subscribe("agent-B")
    s.subscribe("agent-B")

    expect(calls).toEqual([{ agentId: "agent-B", active: true }])
  })

  it("stays active while a second subscriber remains, then deactivates on the last", () => {
    track()
    const s1 = socket()
    const s2 = socket()

    s1.subscribe("agent-C")
    s2.subscribe("agent-C")
    // Only the first subscriber activates; the second is a no-op transition.
    expect(calls).toEqual([{ agentId: "agent-C", active: true }])

    s1.unsubscribe("agent-C")
    // Still one subscriber left — no deactivation.
    expect(calls).toEqual([{ agentId: "agent-C", active: true }])

    s2.unsubscribe("agent-C")
    expect(calls).toEqual([
      { agentId: "agent-C", active: true },
      { agentId: "agent-C", active: false },
    ])
  })

  it("deactivates when the last subscribing socket closes", () => {
    track()
    const s = socket()

    s.subscribe("agent-D")
    s.close()

    expect(calls).toEqual([
      { agentId: "agent-D", active: true },
      { agentId: "agent-D", active: false },
    ])
  })
})
