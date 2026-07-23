import { describe, it, expect } from "vitest"
import { encodeFrame, decodeFrame } from "./frame.js"

describe("tunnel frame codec", () => {
  it("round-trips a control frame with no payload", () => {
    const { header, payload } = decodeFrame(
      encodeFrame({ t: "register", serverId: "srv-1", accessToken: "jwt.abc.def" })
    )
    expect(header).toEqual({ t: "register", serverId: "srv-1", accessToken: "jwt.abc.def" })
    expect(payload.length).toBe(0)
  })

  it("round-trips a data frame with a binary payload byte-exactly", () => {
    const body = new Uint8Array([0, 255, 10, 13, 128, 42])
    const { header, payload } = decodeFrame(
      encodeFrame({ t: "http-res-chunk", id: 7 }, body)
    )
    expect(header).toEqual({ t: "http-res-chunk", id: 7 })
    expect(Array.from(payload)).toEqual(Array.from(body))
  })

  it("preserves multi-byte UTF-8 in headers and payloads", () => {
    const body = new TextEncoder().encode("héllo → 世界 🚀")
    const frame = encodeFrame(
      { t: "http-open", id: 1, method: "POST", path: "/api/naïve?q=café", headers: { "x-café": "über" } },
      body
    )
    const { header, payload } = decodeFrame(frame)
    expect(header.t).toBe("http-open")
    if (header.t === "http-open") {
      expect(header.path).toBe("/api/naïve?q=café")
      expect(header.headers["x-café"]).toBe("über")
    }
    expect(new TextDecoder().decode(payload)).toBe("héllo → 世界 🚀")
  })

  it("decodes from a view into a larger pooled buffer (Node Buffer semantics)", () => {
    const frame = encodeFrame({ t: "ws-data", id: 3, binary: false }, new TextEncoder().encode("hi"))
    // Simulate ws handing us a subarray of a shared pool: place the frame at a
    // non-zero offset inside a bigger ArrayBuffer.
    const pool = new Uint8Array(frame.length + 16)
    pool.set(frame, 8)
    const viewIntoPool = pool.subarray(8, 8 + frame.length)
    const { header, payload } = decodeFrame(viewIntoPool)
    expect(header).toEqual({ t: "ws-data", id: 3, binary: false })
    expect(new TextDecoder().decode(payload)).toBe("hi")
  })

  it("returns a payload that survives mutation of the source buffer", () => {
    const source = encodeFrame({ t: "ws-data", id: 1, binary: true }, new Uint8Array([1, 2, 3]))
    const { payload } = decodeFrame(source)
    // Overwrite the source; the decoded payload must be an independent copy.
    source.fill(0)
    expect(Array.from(payload)).toEqual([1, 2, 3])
  })

  it("throws on a truncated frame", () => {
    expect(() => decodeFrame(new Uint8Array([0, 0]))).toThrow(/too short/)
    // Header length claims more bytes than exist.
    const bad = new Uint8Array(6)
    new DataView(bad.buffer).setUint32(0, 100, false)
    expect(() => decodeFrame(bad)).toThrow(/exceeds buffer/)
  })

  it("rejects an unknown frame type", () => {
    const bogus = new Uint8Array(4 + 20)
    const headerBytes = new TextEncoder().encode(JSON.stringify({ t: "nope", id: 1 }))
    new DataView(bogus.buffer).setUint32(0, headerBytes.length, false)
    bogus.set(headerBytes, 4)
    expect(() => decodeFrame(bogus.subarray(0, 4 + headerBytes.length))).toThrow()
  })
})
