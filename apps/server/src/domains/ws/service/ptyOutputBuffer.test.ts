import { describe, expect, it } from "vitest"
import { PtyOutputBuffer, trimToLineBoundary } from "./ptyOutputBuffer.js"

describe("trimToLineBoundary", () => {
  it("returns the buffer unchanged when under the cap", () => {
    expect(trimToLineBoundary("abc\ndef", 100)).toBe("abc\ndef")
  })

  it("drops the partial first line after slicing to the cap", () => {
    expect(trimToLineBoundary("line1\nline2\nline3", 10)).toBe("line3")
  })

  it("does not start a replay inside an escape sequence", () => {
    const buf = "\x1b[31mred\x1b[0m\nplain"
    const trimmed = trimToLineBoundary(buf, buf.length - 2)
    expect(trimmed).toBe("plain")
  })

  it("keeps the raw tail when it holds no newline", () => {
    expect(trimToLineBoundary("abcdefghij", 4)).toBe("ghij")
  })
})

describe("PtyOutputBuffer", () => {
  it("returns everything appended while under the cap", () => {
    const buf = new PtyOutputBuffer(100)
    buf.append("hello ")
    buf.append("world")
    expect(buf.read()).toBe("hello world")
  })

  it("trims reads to the cap on a line boundary", () => {
    const buf = new PtyOutputBuffer(12)
    buf.append("first line\n")
    buf.append("second\n")
    buf.append("third\n")
    expect(buf.read()).toBe("third\n")
  })

  it("never grows past twice the cap between reads", () => {
    const buf = new PtyOutputBuffer(10)
    for (let i = 0; i < 100; i++) buf.append("0123456789\n")
    expect(buf.read().length).toBeLessThanOrEqual(10)
    expect(buf.read()).toBe("")
  })
})
