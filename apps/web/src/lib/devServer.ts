import { addServer, getActiveServerId, getServers, setActiveServerId } from "@huxflux/shared"

// Matches the dev daemon in apps/server/scripts/dev-daemon.mjs.
const DEV_SERVER_URL = "http://localhost:3002"
const DEV_SERVER_TOKEN = "dev"

/**
 * In a dev build, make sure the local dev server is registered with the
 * daemon's fixed token, and select it on first run so the app opens
 * connected instead of on the onboarding screen.
 */
export function ensureDevServer(): void {
  if (!import.meta.env.DEV) return
  const isNew = !getServers().some((s) => s.url.replace(/\/$/, "") === DEV_SERVER_URL)
  const server = addServer({ name: "Dev server", url: DEV_SERVER_URL, token: DEV_SERVER_TOKEN })
  if (isNew || !getActiveServerId()) setActiveServerId(server.id)
}
