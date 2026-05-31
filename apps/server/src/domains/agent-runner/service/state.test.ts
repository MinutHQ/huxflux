import { describe, expect, it } from "vitest"
import { createStreamState } from "./state.js"

describe("createStreamState", () => {
  it("initializes all string accumulators to empty", () => {
    const s = createStreamState()
    expect(s.pendingText).toBe("")
    expect(s.fullContent).toBe("")
    expect(s.fullThinking).toBe("")
  })

  it("initializes tool-call collection as empty array with zero order index", () => {
    const s = createStreamState()
    expect(s.collectedToolCalls).toEqual([])
    expect(s.toolCallOrderIdx).toBe(0)
  })

  it("initializes all token counters to null (distinct from 0)", () => {
    const s = createStreamState()
    expect(s.inputTokens).toBeNull()
    expect(s.outputTokens).toBeNull()
    expect(s.cacheReadTokens).toBeNull()
    expect(s.cacheWriteTokens).toBeNull()
  })
})
