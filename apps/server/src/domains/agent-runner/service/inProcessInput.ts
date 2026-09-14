// Input channel for an in-process turn. The control protocol writes
// stream-json lines (user messages, control responses) to a running turn's
// `stdin`; for a spawned CLI that is a real pipe. For an in-process provider
// this module supplies a Writable that parses the same lines and turns them
// into an async queue of user messages plus resolved permission responses,
// so `injectUserMessage` / `answerPendingQuestion` work unchanged.

import { Writable } from "node:stream"

/** Minimal unbounded async queue: push values in, consume with for-await. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(value: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value, done: false })
    else this.values.push(value)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as T, done: true })
  }

  get isClosed(): boolean {
    return this.closed
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const value = this.values.shift()
        if (value !== undefined) return Promise.resolve({ value, done: false })
        if (this.closed) return Promise.resolve({ value: undefined as T, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      },
      return: (): Promise<IteratorResult<T>> => {
        this.close()
        return Promise.resolve({ value: undefined as T, done: true })
      },
    }
  }
}

export interface ControlResponsePayload {
  behavior?: string
  updatedInput?: Record<string, unknown>
  message?: string
}

interface InputChannelHandlers {
  onUserMessage: (text: string) => void
  onControlResponse: (requestId: string, response: ControlResponsePayload) => void
  onEnd: () => void
}

interface StreamJsonLine {
  type?: string
  message?: { content?: unknown }
  response?: { request_id?: string; response?: ControlResponsePayload }
}

/** Text of a stream-json user message: a plain string or joined text blocks. */
export function userMessageText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((block) => (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string" ? (block as { text: string }).text : ""))
    .join("")
}

/**
 * A Writable that accepts newline-delimited stream-json lines (the exact
 * shape the control protocol writes to a CLI's stdin) and dispatches them.
 * Malformed or unknown lines are dropped. `end()` fires `onEnd` once.
 */
export function createInputSink(handlers: InputChannelHandlers): Writable {
  let buffer = ""
  const dispatch = (line: string): void => {
    let parsed: StreamJsonLine
    try {
      parsed = JSON.parse(line) as StreamJsonLine
    } catch {
      return
    }
    if (parsed.type === "user") {
      const text = userMessageText(parsed.message?.content)
      if (text) handlers.onUserMessage(text)
    } else if (parsed.type === "control_response") {
      const requestId = parsed.response?.request_id
      if (requestId) handlers.onControlResponse(requestId, parsed.response?.response ?? {})
    }
  }
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback): void {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) if (line.trim()) dispatch(line)
      callback()
    },
    final(callback): void {
      if (buffer.trim()) dispatch(buffer)
      buffer = ""
      handlers.onEnd()
      callback()
    },
  })
}
