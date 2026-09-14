import { describe, expect, it } from "vitest"
import { AsyncQueue, createInputSink, userMessageText, type ControlResponsePayload } from "./inProcessInput.js"
import { buildUserMessageLine } from "./controlProtocol.js"

async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of iterable) out.push(v)
  return out
}

describe("AsyncQueue", () => {
  it("delivers pushed values in order and ends on close", async () => {
    const q = new AsyncQueue<number>()
    q.push(1); q.push(2)
    const drained = drain(q)
    q.push(3)
    q.close()
    expect(await drained).toEqual([1, 2, 3])
    expect(q.isClosed).toBe(true)
  })

  it("wakes a waiting consumer when a value arrives", async () => {
    const q = new AsyncQueue<string>()
    const it = q[Symbol.asyncIterator]()
    const pending = it.next()
    q.push("late")
    expect(await pending).toEqual({ value: "late", done: false })
  })

  it("resolves waiting consumers as done on close and drops later pushes", async () => {
    const q = new AsyncQueue<string>()
    const it = q[Symbol.asyncIterator]()
    const pending = it.next()
    q.close()
    expect((await pending).done).toBe(true)
    q.push("ignored")
    expect((await it.next()).done).toBe(true)
  })

  it("closes when the consumer breaks out of for-await", async () => {
    const q = new AsyncQueue<number>()
    q.push(1); q.push(2)
    for await (const v of q) { if (v === 1) break }
    expect(q.isClosed).toBe(true)
  })
})

describe("userMessageText", () => {
  it("accepts a string or joins text blocks, ignoring other blocks", () => {
    expect(userMessageText("hi")).toBe("hi")
    expect(userMessageText([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])).toBe("ab")
    expect(userMessageText(undefined)).toBe("")
  })
})

describe("createInputSink", () => {
  function make() {
    const users: string[] = []
    const controls: Array<{ requestId: string; response: ControlResponsePayload }> = []
    let ended = 0
    const sink = createInputSink({
      onUserMessage: (t) => users.push(t),
      onControlResponse: (requestId, response) => controls.push({ requestId, response }),
      onEnd: () => { ended++ },
    })
    return { sink, users, controls, ended: () => ended }
  }

  it("parses the exact user-message line the control protocol writes", () => {
    const { sink, users } = make()
    sink.write(buildUserMessageLine("do more") + "\n")
    expect(users).toEqual(["do more"])
  })

  it("parses control_response lines into request id plus payload", () => {
    const { sink, controls } = make()
    const line = JSON.stringify({
      type: "control_response",
      response: { subtype: "success", request_id: "req-9", response: { behavior: "allow", updatedInput: { answers: { q: "a" } } } },
    })
    sink.write(line + "\n")
    expect(controls).toEqual([{ requestId: "req-9", response: { behavior: "allow", updatedInput: { answers: { q: "a" } } } }])
  })

  it("buffers partial lines across writes and handles several lines per chunk", () => {
    const { sink, users } = make()
    const a = buildUserMessageLine("one")
    const b = buildUserMessageLine("two")
    sink.write(a.slice(0, 10))
    sink.write(a.slice(10) + "\n" + b + "\n")
    expect(users).toEqual(["one", "two"])
  })

  it("drops malformed JSON, unknown types, and empty user messages", () => {
    const { sink, users, controls } = make()
    sink.write("{nope\n")
    sink.write(JSON.stringify({ type: "mystery" }) + "\n")
    sink.write(JSON.stringify({ type: "user", message: { content: [] } }) + "\n")
    sink.write(JSON.stringify({ type: "control_response", response: {} }) + "\n")
    expect(users).toEqual([])
    expect(controls).toEqual([])
  })

  it("flushes a trailing line without newline and fires onEnd once on end()", async () => {
    const { sink, users, ended } = make()
    sink.write(buildUserMessageLine("tail"))
    await new Promise<void>((resolve) => sink.end(resolve))
    expect(users).toEqual(["tail"])
    expect(ended()).toBe(1)
    expect(sink.writable).toBe(false)
  })
})
