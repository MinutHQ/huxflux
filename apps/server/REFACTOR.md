# Server Refactor Plan

## Problem

The server's flat `src/` root has accumulated responsibilities that don't belong together. This caused repeated bugs during the web UI bundling work: path resolution errors, duplicate `setNotFoundHandler` crashes, auth blocking static files, SPA fallback logic in the error handler, and connection injection spread across four files. Each fix touched multiple unrelated files because concerns are tangled.

## Current state

```
src/
  index.ts          (~230 lines) Server entry. Does too much: static file serving,
                    route registration, startup sequence, port binding, connection.json,
                    file watchers, updater, reserve pool init.
  cli.ts            (~1400 lines) Every CLI command in one file. Setup wizard, start/stop,
                    service management, config, sandbox, data, uninstall, restore, reset.
  errorHandler.ts   Error normalization + setNotFoundHandler + SPA fallback + connection
                    injection. The SPA/web concerns don't belong here.
  auth.ts           Auth middleware. Doesn't know about static files, had to be patched
                    with AUTH_PREFIXES to avoid blocking the web UI.
  config.ts         Config loading. Fine as-is.
  updater.ts        Version checker + auto-update. Imports from version.ts and settings.
  askStore.ts       In-memory pending question state for AskUserQuestion.
  version.ts        Single export. Fine as-is.
  sandbox.ts        Firejail wrapper. Fine as-is.
  jobs.ts           Job registry. Fine as-is.
  jobTypes.ts       Job interface. Fine as-is.
```

## What went wrong (concrete bugs from this session)

1. **setNotFoundHandler crash**: Added SPA fallback in index.ts, didn't know errorHandler.ts already set one. Fastify only allows one per scope. Two files both claiming the 404 handler.

2. **Auth blocking static files**: auth.ts had a whitelist of public routes. Adding web UI at `/` wasn't in the whitelist. Had to add `AUTH_PREFIXES` to flip the logic to "only auth API routes". This inverted logic is fragile.

3. **Path resolution (`../web` vs `../../web`)**: Web dist path computed differently in cli.ts (for `huxflux open`) and index.ts (for serving). Both used `fileURLToPath(import.meta.url)` with different relative paths. Broke because tsup output structure wasn't obvious.

4. **Connection injection in three places**: Tauri injects in lib.rs, server injects in errorHandler.ts, and index.ts also builds injected HTML. The injection logic (JSON.stringify the connection, build script tag, replace </head>) is duplicated.

5. **CLI too big to navigate**: Every fix to the setup wizard, service management, or update flow required scrolling through 1400 lines. Functions reference each other across the file with no clear grouping.

## Proposed structure

### 1. Web UI serving: `domains/web-ui/`

Own the entire "serve the bundled web app" concern.

```
domains/web-ui/
  README.md
  web-ui.routes.ts      Fastify plugin: registers @fastify/static, the GET / route,
                        and the SPA fallback. Handles connection injection.
  web-ui.service.ts     getInjectedHtml(), getWebDistDir(), hasWebUI()
  web-ui.types.ts       ConnectionInfo type
```

**Owns:**
- Static file serving configuration
- SPA fallback (not-found handler for non-API routes, registered as a scoped plugin with its own prefix to avoid conflicts)
- Connection data injection into index.html
- Path resolution for web dist directory (single source of truth)
- The `huxflux open` URL decision (local vs Netlify fallback)

**Removes from:**
- index.ts: static plugin registration, webDistDir logic
- errorHandler.ts: SPA fallback, connection injection, fs/path imports
- auth.ts: the AUTH_PREFIXES hack (web-ui plugin handles its own auth skip)
- cli.ts: web dist path check in cmdOpen

### 2. Auth: keep flat but simplify

With web-ui as a scoped plugin handling its own routes, auth.ts goes back to simple:

```ts
const PUBLIC = new Set(["/health", "/api/config"])
const PUBLIC_PREFIXES = ["/docs"]
```

No need for `AUTH_PREFIXES` or "only auth API routes" inversion. The web-ui plugin registers with `{ prefix: "/" }` in its own encapsulation context and doesn't add the auth hook. API routes in the root context still get auth.

Actually: Fastify scoped plugins with `prefix: "/"` share the root scope (that's what caused the setNotFoundHandler crash). Alternative: web-ui registers with a different approach:
- Option A: Register static files before the auth hook (order-dependent, fragile)
- Option B: Auth hook checks if the request was already handled by static (check reply.sent)
- Option C: Web UI served on a separate Fastify instance on the same port (cleanest isolation but complex)
- Option D: Auth hook explicitly skips non-API paths (current approach, just better organized)

Recommend Option D but with the logic living in web-ui's plugin, not in auth.ts. The web-ui plugin adds a preHandler that marks requests as public. Auth checks that mark.

### 3. CLI: split by command group

```
src/cli/
  index.ts              Dispatch (switch/case), version check, help text
  start.ts              startServer(), cmdStart(), runSupervisor()
  stop.ts               cmdStop(), isServiceInstalled()
  setup.ts              cmdSetup() (the interactive wizard)
  service.ts            installSystemService(), removeSystemService()
  config.ts             cmdConfig() (auto-update setting)
  update.ts             cmdUpdate()
  status.ts             cmdStatus(), printConnectInfo(), connectionString()
  open.ts               cmdOpen()
  data.ts               cmdData() (dev-to-prod copy)
  uninstall.ts          cmdUninstall()
  restore.ts            cmdRestore()
  reset.ts              cmdReset()
  sandbox.ts            cmdSandbox(), cmdSandboxSetup()
  helpers.ts            loadConfig(), saveConfig(), getRunningPid(), serverEnv(),
                        ensureDataDir(), prompt(), getOutboundIp()
```

Each file is 50-150 lines. The dispatch in index.ts is just a switch that imports and calls.

**Note:** cli.ts is built as a separate tsup entry point. The split files just become imports. No build config change needed.

### 4. index.ts: thin startup orchestrator

After extracting web-ui and simplifying:

```ts
// index.ts (~80 lines)
import Fastify from "fastify"
// ... plugin registrations
// ... middleware (cors, auth, ws)
// ... domain plugins
// ... web-ui plugin (if bundled)
// ... startup: migrations, jobs, updater, port binding, connection.json
```

Each concern is a single `app.register()` or function call. The file reads as a sequence of phases, not interleaved logic.

### 5. Error handler: just errors

errorHandler.ts goes back to its single job: normalizing errors. No SPA fallback, no fs imports, no connection injection.

```ts
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => { /* normalize and send */ })
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ code: "not_found", message: "Route not found" })
  })
}
```

The web-ui domain handles its own not-found for non-API routes. The root not-found only fires for actual API 404s.

## Migration order

1. **web-ui domain** (highest impact, most bugs came from here)
2. **CLI split** (biggest file, most maintenance burden)
3. **index.ts cleanup** (follows naturally from 1 and 2)
4. **errorHandler simplification** (follows from 1)

Each step is independently shippable. No big-bang refactor.

## Open question: scoped plugin isolation

The core Fastify challenge: scoped plugins with `prefix: "/"` don't actually scope `setNotFoundHandler`. Options:

- **Encapsulate web-ui in a sub-app** with `fastify-plugin` set to NOT propagate (the default for scoped plugins). The web-ui plugin registers its own not-found handler. If this works with `prefix: "/"`, it's the cleanest.
- **Single not-found handler** that dispatches based on URL. Less pure but guaranteed to work. The handler lives in a shared module that web-ui populates at registration time.
- **Wildcard route** instead of not-found handler. `app.get("/*", handler)` with lower priority than API routes. Fastify might not support route priority this way.

Test before committing to an approach.
