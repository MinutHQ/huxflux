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
  index.ts       HTTP server + upgrade routing + server-registration handshake.
  config.ts      Env-var config (PORT, HOST, optional auth secrets).
  logger.ts      Prefixed console logger (no shared pino here).
  auth.ts        Pluggable, permissive-by-default auth hooks.
  registry.ts    serverId → Tunnel map (many concurrent servers).
  tunnel.ts      One server's control socket + the stream multiplexer.
  httpProxy.ts   Tunnel a client HTTP request → server → stream response back.
  wsProxy.ts     Tunnel a client WebSocket (WS-over-WS).
  util.ts        Path parsing, header sanitizing, byte helpers, error helpers.
```

The wire protocol (frame format, header union) is NOT defined here — it lives in
`@huxflux/shared/proxy` so the proxy and the server-side connector share one
source of truth. Never fork it.

## Rules

- The proxy is transparent. It does not parse Huxflux payloads, know routes, or
  add behavior — it moves bytes. CORS, auth, and validation are the real
  server's job and tunnel through untouched. Resist adding feature logic here.
- Keep it dependency-light: `ws` + `@huxflux/shared` only. No Fastify, no DB.
- Auth is deferred by design. Enforce the two env secrets when set, stay open
  when unset, and keep the checks isolated in `auth.ts` so a real credential
  store can drop in later without touching tunneling code.
- Standard file-size caps apply (400-line files, 80-line functions).

## Run it

- Dev: `pnpm --filter huxflux-proxy dev` (tsx watch).
- Build: `pnpm --filter huxflux-proxy build` (tsup → `dist/index.js`).
- A server points at it with `PROXY_URL`, `PROXY_SERVER_ID`, `PROXY_SECRET`
  (see apps/server/src/domains/proxy-connector).
