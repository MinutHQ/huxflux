# apps/proxy — Agent Rules

The public relay that lets Huxflux run over the Internet: a client on one
machine talks to a Huxflux server on another, behind NAT, without either being
directly reachable.

Read the root CLAUDE.md first.

## What it is

A standalone Node service (no Fastify, no DB) that runs on a permanent, publicly
reachable host. It does one job: multiplex client traffic to the right Huxflux
server over a single WebSocket that the server dialed out.

```
client (browser / desktop)                 Huxflux server (behind NAT)
        │  https/wss                                │  wss (dials out)
        ▼                                            ▼
   ┌──────────────────────  apps/proxy  ──────────────────────┐
   │  /s/<serverId>/...  ── HTTP/WS ──►  tunnel  ──► /_tunnel  │
   └───────────────────────────────────────────────────────────┘
```

- Servers connect to `wss://<proxy>/_tunnel` and register with an id.
- Clients use the normal Huxflux REST/WS API under `https://<proxy>/s/<serverId>`.
- The proxy strips the `/s/<serverId>` prefix and tunnels the rest — REST bodies
  and WebSocket frames both — over the server's control socket.

## Layout

```
src/
  index.ts       HTTP server + upgrade routing + OAuth routes + register handshake.
  config.ts      Env-var config (PORT, HOST, Google creds, allowed domain, JWT).
  logger.ts      Prefixed console logger (no shared pino here).
  auth.ts        JWT verification for registering servers and requesting clients.
  registry.ts    (email, serverId) → Tunnel map (per-user namespaced).
  tunnel.ts      One server's control socket + the stream multiplexer.
  httpProxy.ts   Tunnel a client HTTP request → server → stream response back.
  wsProxy.ts     Tunnel a client WebSocket (WS-over-WS).
  util.ts        Path parsing, header sanitizing, byte + CORS/JSON helpers.
  oauth/
    handlers.ts  The /oauth/auth · /authorize · /callback · /token endpoints.
    google.ts    Google consent URL + code exchange + domain check.
    jwt.ts       HS256 access-token sign/verify (jose).
    refresh.ts   Opaque refresh tokens (hashed in the DB).
    sessions.ts  In-memory pending device-flow sessions.
    db.ts        node:sqlite store (refresh tokens + generated secrets).
```

The wire protocol (frame format, header union) is NOT defined here — it lives in
`@huxflux/shared/proxy` so the proxy and the server-side connector share one
source of truth. Never fork it.

## Rules

- The proxy is transparent for tunneled traffic. It does not parse Huxflux
  payloads or know routes — it moves bytes. Inner CORS and validation are the
  real server's job and tunnel through untouched. Resist adding feature logic.
- Auth is NOT deferred anymore. Every tunneled request and every server
  registration presents a signed access token (JWT); the proxy derives the
  owner email and only connects a client to a server owned by the same user
  (`registry.ts`). Keep verification isolated in `auth.ts` / `oauth/`.
- Delegate identity to Google — never build a login form here. The proxy is the
  authorization server; Google is the IdP.
- Dependencies: `ws`, `jose`, `@huxflux/shared`, and `node:sqlite`. No Fastify.
- Standard file-size caps apply (400-line files, 80-line functions).

## Auth model

- Two tokens are distinct: the **proxy** access JWT (authenticates to the proxy,
  header `X-Huxflux-Proxy-Authorization` or `?proxy_token=`) and the tunneled
  server's own token (injected by the connector on loopback, never sent by the
  remote client). The proxy strips its own token before forwarding.
- Access tokens are HS256 JWTs carrying the user email (default 1h). Refresh
  tokens are opaque, stored hashed in SQLite, long-lived, revocable.
- `GET /servers` (authenticated) lists the caller's currently-registered
  servers, so a client can pick one after signing in without knowing its id.
- Config: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PROXY_ALLOWED_DOMAIN`
  (comma-separated), `PROXY_PUBLIC_URL` (for redirect URIs). Optional:
  `PROXY_JWT_SECRET` (auto-generated + persisted if unset), `PROXY_ACCESS_TTL`,
  `PROXY_DB_PATH`. The OAuth flow returns 503 until the first four are set;
  registration / request verification only needs the JWT secret.

## Run it

- Dev: `pnpm --filter huxflux-proxy dev` (tsx watch).
- Build: `pnpm --filter huxflux-proxy build` (tsup → `dist/index.js`).
- A server points at it with `PROXY_URL` + `PROXY_SERVER_ID` and signs in via the
  OAuth device flow on first run (see apps/server/src/domains/proxy-connector).
