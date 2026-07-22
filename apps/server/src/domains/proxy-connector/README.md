# proxy-connector

Dials the server out to a public proxy (`apps/proxy`) so clients can reach this
Huxflux instance over the Internet, through NAT. When the proxy config is unset
this domain does nothing.

## Owns

- The outbound tunnel connection to the proxy and its reconnect lifecycle.
- Replaying tunneled client requests against the local server over loopback:
  HTTP (buffered request, streamed response) and WebSocket (WS-over-WS).
- The proxy connect string the startup banner prints.

## Public surface

- `proxy-connector.service.ts` — `startProxyConnector()`, `stopProxyConnector()`,
  `isProxyConfigured()`, `proxyClientConnectString()`. Booted from `src/index.ts`
  after the HTTP server binds (it needs `config.boundPort`).

## Depends on

- `@huxflux/shared/proxy` — the tunnel wire protocol (shared with the proxy).
- `ws` — the WebSocket client for both the proxy tunnel and loopback sockets.
- `src/config.ts` (PROXY_URL / PROXY_SERVER_ID / PROXY_SECRET), `src/logger.ts`,
  `src/version.ts`.

## Sub-domains

None.

## Quirks

- The proxy allocates every stream id; this side only looks ids up.
- Loopback requests carry the original client headers (including the bearer
  token), so the server's normal `authHook` validates them — the tunnel adds no
  auth bypass. WebSocket auth rides the `?token=` query the client already sets.
- `accept-encoding` is stripped from tunneled requests so the loopback response
  is identity-encoded and its bytes match the forwarded headers.
- Registration failure (`register-failed`) stops the connector without retry;
  transport drops reconnect with capped exponential backoff.
