import {
  tunnelFrameHeaderSchema,
  type TunnelFrame,
  type TunnelFrameHeader,
} from "./proxy.types.js"

// Binary frame codec for the tunnel protocol. Every frame is one WebSocket
// message shaped as:
//
//   [ 4-byte big-endian header length ][ UTF-8 JSON header ][ raw payload bytes ]
//
// The JSON header is the discriminated union in `proxy.types.ts`; the payload
// is the raw request/response/WebSocket body (empty for control frames). Using
// a length-prefixed binary envelope keeps payloads byte-exact — no base64
// inflation for terminal output or file uploads.
//
// Implemented with `Uint8Array` / `DataView` / `TextEncoder` (not Node
// `Buffer`) so the codec is safe to bundle for every platform, even though the
// only runtime callers are the Node proxy and the Node server connector.

const HEADER_LENGTH_BYTES = 4
const EMPTY = new Uint8Array(0)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeFrame(header: TunnelFrameHeader, payload?: Uint8Array): Uint8Array {
  const headerBytes = encoder.encode(JSON.stringify(header))
  const body = payload ?? EMPTY
  const out = new Uint8Array(HEADER_LENGTH_BYTES + headerBytes.length + body.length)
  new DataView(out.buffer).setUint32(0, headerBytes.length, false)
  out.set(headerBytes, HEADER_LENGTH_BYTES)
  out.set(body, HEADER_LENGTH_BYTES + headerBytes.length)
  return out
}

export function decodeFrame(data: Uint8Array): TunnelFrame {
  if (data.length < HEADER_LENGTH_BYTES) {
    throw new Error("tunnel frame too short to contain a header length")
  }
  // Respect byteOffset/byteLength: a Node Buffer's underlying ArrayBuffer is
  // often a shared pool larger than the logical view.
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const headerLen = view.getUint32(0, false)
  const headerStart = HEADER_LENGTH_BYTES
  const headerEnd = headerStart + headerLen
  if (headerEnd > data.length) {
    throw new Error("tunnel frame header length exceeds buffer")
  }
  const headerJson = decoder.decode(data.subarray(headerStart, headerEnd))
  const header = tunnelFrameHeaderSchema.parse(JSON.parse(headerJson))
  // Copy the payload out of the (possibly pooled/shared) source buffer so the
  // caller can retain it safely after `ws` reuses the read buffer.
  const payload = data.subarray(headerEnd)
  return { header, payload: payload.length === 0 ? EMPTY : new Uint8Array(payload) }
}

export {
  tunnelFrameHeaderSchema,
  TUNNEL_PATH,
  SERVER_PREFIX,
  OAUTH_PATHS,
  PROXY_AUTH_HEADER,
  PROXY_TOKEN_QUERY,
  PROXY_SERVERS_PATH,
  proxyAuthStartSchema,
  proxyTokenSchema,
  proxyTokenErrorSchema,
  proxyServerInfoSchema,
  proxyServersResponseSchema,
} from "./proxy.types.js"
export type {
  TunnelFrame,
  TunnelFrameHeader,
  StreamId,
  ProxyAuthStart,
  ProxyToken,
  ProxyTokenError,
  ProxyServerInfo,
} from "./proxy.types.js"
