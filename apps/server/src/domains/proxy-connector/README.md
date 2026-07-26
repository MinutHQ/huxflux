# proxy-connector

Dials the server out to a public proxy (`apps/proxy`) so clients can reach this
Huxflux instance over the Internet, through NAT. When the proxy config is unset
this domain does nothing.

## Owns

- The outbound tunnel connection to the proxy and its reconnect lifecycle.
- The proxy sign-in (OAuth device flow): obtaining, refreshing, and persisting
  the access + refresh tokens the server authenticates to the proxy with.
- The server's stable random registration key (generated once, stored with the
  refresh token) and its human name (PROXY_SERVER_NAME, default hostname).
- Replaying tunneled client requests against the local server over loopback:
  HTTP (buffered request, streamed response) and WebSocket (WS-over-WS).
- The proxy connect string the startup banner prints.

## Public surface

- `proxy-connector.service.ts` — `startProxyConnector()`, `stopProxyConnector()`,
  `isProxyConfigured()`, `proxyClientConnectString()`. Booted from `src/index.ts`
  after the HTTP server binds (it needs `config.boundPort`).
- `proxyAuth.ts` — `authenticateProxy(proxyUrl, onUrl)`. Runs the interactive
  device-flow sign-in and persists the tokens, so the CLI (`huxflux proxy` /
  `huxflux setup`) can complete the sign-in in the operator's terminal before the
  background server starts. Thin re-exporter kept apart from the service file so
  the CLI doesn't bundle the tunnel client.

## Depends on

- `@huxflux/shared` — the tunnel wire protocol + the OAuth device-flow client
  helpers (`runProxyAuthFlow`, `refreshProxyToken`).
- `ws` — the WebSocket client for both the proxy tunnel and loopback sockets.
- `src/config.ts` (PROXY_URL / PROXY_SERVER_NAME), `src/logger.ts`, `src/version.ts`.

## Sub-domains

None.

## Quirks

- The proxy allocates every stream id; this side only looks ids up.
- The connector never sets its own public URL id: it sends a random `serverKey`
  and the proxy derives the id (HMAC). The proxy echoes the derived id in the
  `registered` frame, which the connector logs as the reachable URL.
- Auth: sign-in normally happens up front in the CLI (`authenticateProxy`), so
  the tokens are already cached when the connector starts. As a fallback, on first
  run (or after refresh-token revocation) the connector itself prints a Google
  sign-in URL to the server log and blocks the tunnel until an operator completes
  it. Tokens are cached in `~/huxflux/proxy-auth.json` and refreshed
  transparently. The access token rides the register frame.
- The remote client authenticates to the *proxy*, not to this server, so it
  sends no inner token. The connector injects the server's own token
  (`config.authToken`) on the loopback leg — Authorization header for HTTP, a
  `?token=` query param for WebSockets — so the server's normal `authHook` still
  validates every tunneled request. No auth bypass is added to the server.
- `accept-encoding` is stripped from tunneled requests so the loopback response
  is identity-encoded and its bytes match the forwarded headers.
- `register-failed` drops the cached access token and reconnects (re-auth on the
  next attempt); transport drops reconnect with capped exponential backoff.
