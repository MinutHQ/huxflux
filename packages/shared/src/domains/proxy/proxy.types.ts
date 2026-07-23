import { z } from "zod"

// Wire protocol for the Huxflux tunnel. A single WebSocket connection between a
// Huxflux server and the public proxy carries many logical streams (one per
// client HTTP request or client WebSocket) multiplexed by `id`. The proxy
// allocates every stream id, so a server never picks ids and collisions are
// impossible.
//
// Both the proxy (apps/proxy) and the server-side connector
// (apps/server/src/domains/proxy-connector) import these types + the codec in
// `frame.ts`, so the two ends can never drift out of sync.

/** A multiplexed logical stream over one tunnel connection. Allocated by the proxy. */
export type StreamId = number

const httpHeaders = z.record(z.string(), z.string())

// The header of a tunnel frame. Every frame is `[4-byte header length][JSON
// header][raw payload bytes]`; see `frame.ts`. The `t` discriminator selects
// the variant; only data-carrying frames (`*-chunk`, `ws-data`) have a payload.
export const tunnelFrameHeaderSchema = z.discriminatedUnion("t", [
  // ── Control (server → proxy, then proxy → server) ──────────────────────────
  // First frame a server sends after the socket opens. The server authenticates
  // to the proxy with a signed access token (JWT) obtained via the OAuth flow;
  // the proxy derives the owning user's email from it and namespaces the server
  // registration under that email.
  z.object({
    t: z.literal("register"),
    serverId: z.string().min(1),
    accessToken: z.string(),
    version: z.string().optional(),
  }),
  z.object({ t: z.literal("registered"), version: z.string().optional() }),
  z.object({ t: z.literal("register-failed"), reason: z.string() }),

  // ── HTTP request (proxy → server) ──────────────────────────────────────────
  z.object({
    t: z.literal("http-open"),
    id: z.number(),
    method: z.string(),
    // Path + query, already stripped of the `/s/<serverId>` prefix so it maps
    // 1:1 onto a route the real server exposes.
    path: z.string(),
    headers: httpHeaders,
  }),
  z.object({ t: z.literal("http-req-chunk"), id: z.number() }),
  z.object({ t: z.literal("http-req-end"), id: z.number() }),

  // ── HTTP response (server → proxy) ─────────────────────────────────────────
  z.object({
    t: z.literal("http-res"),
    id: z.number(),
    status: z.number(),
    headers: httpHeaders,
  }),
  z.object({ t: z.literal("http-res-chunk"), id: z.number() }),
  z.object({ t: z.literal("http-res-end"), id: z.number() }),

  // Abort an in-flight HTTP stream in either direction (client hung up, or the
  // loopback request errored).
  z.object({ t: z.literal("http-abort"), id: z.number(), reason: z.string().optional() }),

  // ── WebSocket tunneling (WS-over-WS) ───────────────────────────────────────
  // proxy → server: a client wants to open a WebSocket.
  z.object({
    t: z.literal("ws-open"),
    id: z.number(),
    path: z.string(),
    headers: httpHeaders,
  }),
  // server → proxy: upstream WebSocket connected / failed.
  z.object({ t: z.literal("ws-open-ack"), id: z.number() }),
  z.object({ t: z.literal("ws-open-fail"), id: z.number(), code: z.number().optional(), reason: z.string().optional() }),
  // Either direction: one WebSocket message. `binary` mirrors the original
  // frame's opcode so text stays text and binary stays binary end-to-end.
  z.object({ t: z.literal("ws-data"), id: z.number(), binary: z.boolean() }),
  // Either direction: the WebSocket closed.
  z.object({ t: z.literal("ws-close"), id: z.number(), code: z.number().optional(), reason: z.string().optional() }),
])

export type TunnelFrameHeader = z.infer<typeof tunnelFrameHeaderSchema>

/** A decoded frame: its parsed header plus the raw payload (empty for control frames). */
export interface TunnelFrame {
  header: TunnelFrameHeader
  payload: Uint8Array
}

/** Path the server dials to open a tunnel, and the proxy listens on for servers. */
export const TUNNEL_PATH = "/_tunnel"

/** Prefix under which the proxy exposes each connected server to clients. */
export const SERVER_PREFIX = "/s/"

// ── OAuth device-style flow ──────────────────────────────────────────────────
// The proxy is the authorization server; Google is the identity provider. A
// caller (client or server connector) starts a flow, opens the verification URL
// in a browser, then polls the token endpoint for the result. Both ends share
// these shapes so requests and responses never drift.

/** OAuth endpoint paths on the proxy. All are public (they establish auth). */
export const OAUTH_PATHS = {
  /** POST — start a flow; returns a verification URL + poll handle. */
  start: "/oauth/auth",
  /** GET — the browser lands here; redirects to Google consent. */
  authorize: "/oauth/authorize",
  /** GET — Google redirects back here after consent. */
  callback: "/oauth/callback",
  /** POST — poll for the flow result, or exchange a refresh token. */
  token: "/oauth/token",
} as const

/** Header carrying the proxy access JWT on REST requests (distinct from the
 * tunneled server's own Authorization). */
export const PROXY_AUTH_HEADER = "x-huxflux-proxy-authorization"
/** Query param carrying the proxy access JWT on WebSocket upgrades (which can't
 * set headers). */
export const PROXY_TOKEN_QUERY = "proxy_token"

/** Authenticated endpoint listing the caller's currently-registered servers. */
export const PROXY_SERVERS_PATH = "/servers"

export const proxyServerInfoSchema = z.object({
  serverId: z.string(),
  version: z.string().optional(),
})
export type ProxyServerInfo = z.infer<typeof proxyServerInfoSchema>

export const proxyServersResponseSchema = z.object({
  servers: z.array(proxyServerInfoSchema),
})

export const proxyAuthStartSchema = z.object({
  authId: z.string(),
  verificationUrl: z.string(),
  expiresIn: z.number(),
  interval: z.number(),
})
export type ProxyAuthStart = z.infer<typeof proxyAuthStartSchema>

export const proxyTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  email: z.string().optional(),
  /** Access-token lifetime in seconds. */
  expiresIn: z.number(),
})
export type ProxyToken = z.infer<typeof proxyTokenSchema>

/** Non-terminal / error result of a token poll. */
export const proxyTokenErrorSchema = z.object({
  error: z.enum(["authorization_pending", "slow_down", "expired", "denied", "invalid_grant"]),
})
export type ProxyTokenError = z.infer<typeof proxyTokenErrorSchema>["error"]
