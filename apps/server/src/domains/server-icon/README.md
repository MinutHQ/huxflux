# server-icon

Generates an icon for this server's tile in the client's server switcher by asking the Codex CLI on this machine to draw one.

## Owns

- `GET /api/server-icon/capabilities`: whether the Codex CLI is installed here.
- `POST /api/server-icon/generate`: runs `codex exec` in an empty scratch dir (workspace-write sandbox) asking for `icon.png` from Codex's built-in image tool, and returns it as a PNG data URL. When no PNG appears, it falls back to SVG markup from Codex's last message, stripped of scripts, foreignObject, event handlers, and external links.

## Public surface

- `server-icon.routes.ts`: `serverIconPlugin`, registered in the domain registry.
- `server-icon.service.ts`: `generateServerIcon(description)`, `isCodexAvailable()`, `ServerIconError`, the pure helpers `buildIconPrompt`, `lastAgentMessage`, `extractSvg` (exported for tests), and the test seam `_setServerIconSpawnOverride`.

## Depends on

- `../providers/registry.js`: the Codex adapter's binary resolution and availability.
- `../../logger.js`.
- `@huxflux/shared`: request and response schemas.

## Sub-domains

None.

## Quirks

- Codex's built-in image tool is only exposed to `codex exec` under a ChatGPT login. With an API-key login it is missing (Codex offers an `OPENAI_API_KEY` script fallback, which the prompt forbids), so the SVG fallback kicks in. Verified 2026-10-16 with codex-cli 0.160.1.
- The PNG comes back full size (around 1254px, over 1 MB); the client downscales it before storing.
- One generation runs at a time (a second request gets 429); a run is killed after 140s (SIGTERM, then SIGKILL).
- Trust model: the description goes into a model that can run shell commands in a workspace-write sandbox scoped to the scratch dir. It is fenced and labelled as a visual description, but the real boundary is auth: the caller already holds this server's token, which can drive full agents anyway.
- stdin must be closed on the spawn; `codex exec` otherwise blocks reading extra input.
- The icon is stored by the client, not here.
