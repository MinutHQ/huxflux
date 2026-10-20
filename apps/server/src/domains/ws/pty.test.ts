import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { WebSocket } from "@fastify/websocket"
import { agents as agentsTable } from "../../db/schema.js"
import { createTestDb, type TestDb } from "../../../test/harness.js"
import { hasActivePty, killAgentTerminals, killTerminal, registerPtySocket } from "./pty.js"

interface Frame {
  type: string
  data?: string
  exitCode?: number
}

/** Minimal socket mirroring the surface `registerPtySocket` touches. */
function makeSocket() {
  const frames: Frame[] = []
  const handlers: Record<string, Array<(raw?: string) => void>> = { message: [], close: [] }
  const socket = {
    OPEN: 1,
    readyState: 1,
    send: (raw: string) => { frames.push(JSON.parse(raw) as Frame) },
    close: () => {
      if (socket.readyState === 3) return
      socket.readyState = 3
      handlers.close?.forEach((h) => h())
    },
    on: (event: string, handler: (raw?: string) => void) => { handlers[event]?.push(handler) },
  }
  return {
    socket: socket as unknown as WebSocket,
    frames,
    isClosed: () => socket.readyState === 3,
    input: (data: string) => handlers.message?.forEach((h) => h(JSON.stringify({ type: "input", data }))),
  }
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition")
    await new Promise((r) => setTimeout(r, 20))
  }
}

const outputText = (frames: Frame[]) => frames.filter((f) => f.type === "output").map((f) => f.data).join("")

describe("registerPtySocket", () => {
  let testDb: TestDb
  const originalShell = process.env.SHELL
  const agentId = "agent-pty"

  beforeEach(() => {
    testDb = createTestDb()
    process.env.SHELL = "/bin/sh"
    const now = new Date().toISOString()
    testDb.db.insert(agentsTable).values({
      id: agentId, title: "pty", branch: "main", location: "pty", createdAt: now, updatedAt: now,
    }).run()
  })

  afterEach(() => {
    killAgentTerminals(agentId)
    process.env.SHELL = originalShell
    testDb.close()
  })

  it("sends exit and closes the socket when the shell exits", async () => {
    const client = makeSocket()
    registerPtySocket(client.socket, agentId, "t1", true)
    expect(hasActivePty(agentId)).toBe(true)

    client.input("exit\n")
    await waitFor(() => client.isClosed())

    expect(client.frames.some((f) => f.type === "exit")).toBe(true)
    expect(hasActivePty(agentId)).toBe(false)
  })

  it("sends closed before closing sockets on killTerminal", async () => {
    const client = makeSocket()
    registerPtySocket(client.socket, agentId, "t1", true)

    killTerminal(`${agentId}:t1`)

    expect(client.frames.at(-1)?.type).toBe("closed")
    expect(client.isClosed()).toBe(true)
    expect(hasActivePty(agentId)).toBe(false)
  })

  it("replays earlier output as a replay frame to a fresh client", async () => {
    const first = makeSocket()
    registerPtySocket(first.socket, agentId, "t1", true)
    first.input("echo replay-marker\n")
    await waitFor(() => outputText(first.frames).includes("replay-marker\r\n"))

    const second = makeSocket()
    registerPtySocket(second.socket, agentId, "t1", true)

    expect(second.frames[0]?.type).toBe("replay")
    expect(second.frames[0]?.data).toContain("replay-marker")
  })

  it("does not replay to a client that keeps its screen", async () => {
    const first = makeSocket()
    registerPtySocket(first.socket, agentId, "t1", true)
    first.input("echo kept\n")
    await waitFor(() => outputText(first.frames).includes("kept\r\n"))

    const second = makeSocket()
    registerPtySocket(second.socket, agentId, "t1", false)

    expect(second.frames).toEqual([])
  })
})
