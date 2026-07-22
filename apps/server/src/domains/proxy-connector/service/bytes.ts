// Normalize whatever `ws` hands a message listener into a Uint8Array.
// ws delivers Buffer for single frames and Buffer[] for fragmented messages;
// binaryType defaults leave text frames as Buffers too.
export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) {
    const parts = data.map((d) => toUint8Array(d))
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) { out.set(p, offset); offset += p.length }
    return out
  }
  if (typeof data === "string") return new TextEncoder().encode(data)
  return new Uint8Array(0)
}
