# proxy (shared)

The wire protocol for tunneling Huxflux over the Internet. A Huxflux server
dials out to a public proxy over one WebSocket; the proxy multiplexes every
client HTTP request and client WebSocket over that single connection. This
domain is the single source of truth for the frame format both ends speak.

## Owns

- The tunnel frame format (`[4-byte header length][JSON header][payload]`).
- The discriminated union of frame headers (control, HTTP request/response,
  WebSocket-over-WebSocket).
- The reserved paths (`TUNNEL_PATH`, `SERVER_PREFIX`).

## Public surface

- `frame.ts` — `encodeFrame(header, payload?)`, `decodeFrame(bytes)`, and the
  re-exported types/schema/constants. This is the file the `./proxy` subpath
  export points at.
- `proxy.types.ts` — `TunnelFrameHeader`, `TunnelFrame`, `StreamId`,
  `tunnelFrameHeaderSchema`, `TUNNEL_PATH`, `SERVER_PREFIX`, plus the OAuth
  contract: `OAUTH_PATHS`, `PROXY_AUTH_HEADER`, `PROXY_TOKEN_QUERY`, and the
  `proxyAuthStart` / `proxyToken` / `proxyTokenError` schemas + types.
- `proxyAuth.ts` — client-side driver for the proxy's OAuth device flow
  (`startProxyAuth`, `pollProxyToken`, `refreshProxyToken`, `runProxyAuthFlow`),
  used by the web client and the server connector. Exported from the main
  `@huxflux/shared` barrel (not the codec-only `./proxy` subpath).

## Depends on

- `zod` (header validation) only. No React, no DOM, no Node built-ins — the
  codec is `Uint8Array`/`TextEncoder`-based so it stays universally bundlable.

## Sub-domains

None.

## Quirks

- The proxy allocates every `StreamId`; servers only ever echo one back, so ids
  never collide across the two ends of a tunnel.
- `decodeFrame` validates the header with Zod on every frame. That cost is
  deliberate (protocol-bug safety over micro-throughput); revisit if terminal
  streaming ever proves it a bottleneck.
- `decodeFrame` copies the payload out of the source buffer because `ws` reuses
  its read buffer between messages.
- Consumed only by Node (`apps/proxy`, `apps/server` connector) via the
  `@huxflux/shared/proxy` subpath, which avoids pulling the React-dependent
  parts of the main barrel into those builds.
