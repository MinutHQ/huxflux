# proxy-connector

Dials the server out to a public proxy (`apps/proxy`) so clients can reach this
Huxflux instance over the Internet, through NAT. When the proxy config is unset
this domain does nothing.

## Owns

- The outbound tunnel connection to the proxy and its reconnect lifecycle.
- The proxy sign-in (OAuth device flow): obtaining, refreshing, and persisting
  the access + refresh tokens the server authenticates to the proxy with.
- Replaying tunneled client requests against the local server over loopback:
  HTTP (buffered request, streamed response) and WebSocket (WS-over-WS).
- The proxy connect string the startup banner prints.

## Public surface

- `proxy-connector.service.ts` — `startProxyConnector()`, `stopProxyConnector()`,
  `isProxyConfigured()`, `proxyClientConnectString()`. Booted from `src/index.ts`
  after the HTTP server binds (it needs `config.boundPort`).

## Depends on

- `@huxflux/shared` — the tunnel wire protocol + the OAuth device-flow client
  helpers (`runProxyAuthFlow`, `refreshProxyToken`).
- `ws` — the WebSocket client for both the proxy tunnel and loopback sockets.
- `src/config.ts` (PROXY_URL / PROXY_SERVER_ID), `src/logger.ts`, `src/version.ts`.

## Sub-domains

None.

## Quirks

- The proxy allocates every stream id; this side only looks ids up.
- Auth: on first run (or after refresh-token revocation) the connector prints a
  Google sign-in URL and blocks the tunnel until an operator completes it; tokens
  are cached in `~/huxflux/proxy-auth.json` and refreshed transparently. The
  access token rides the register frame.
- The remote client authenticates to the *proxy*, not to this server, so it
  sends no inner token. The connector injects the server's own token
  (`config.authToken`) on the loopback leg — Authorization header for HTTP, a
  `?token=` query param for WebSockets — so the server's normal `authHook` still
  validates every tunneled request. No auth bypass is added to the server.
- `accept-encoding` is stripped from tunneled requests so the loopback response
  is identity-encoded and its bytes match the forwarded headers.
- `register-failed` drops the cached access token and reconnects (re-auth on the
  next attempt); transport drops reconnect with capped exponential backoff.
