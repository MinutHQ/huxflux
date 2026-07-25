// Cross-platform Zod schemas for the servers domain (huxflux server registry +
// reachability status). The store and hooks consume these. The schemas are
// also used to validate values read out of the on-disk storage adapter so the
// app refuses to deserialize a corrupted blob into a wrong-shaped object.

import { z } from "zod/v4"

// ── HuxfluxServer ────────────────────────────────────────────────────────────

export const huxfluxServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  // Direct (LAN) servers authenticate with this bearer token. Proxied servers
  // leave it unset — the proxy connector supplies the server's own token on the
  // loopback leg, so the client only needs the proxy access token below.
  token: z.string().optional(),
  // ── Proxy auth (set only for servers reached through the public proxy) ──────
  // Signed access JWT sent to the proxy on every request; short-lived, refreshed
  // transparently. The refresh token mints new access tokens. The account email
  // is shown in the UI and lets the proxy gate traffic to same-user servers.
  proxyAccessToken: z.string().optional(),
  proxyRefreshToken: z.string().optional(),
  proxyAccountEmail: z.string().optional(),
  addedAt: z.string(),
})

export type HuxfluxServer = z.infer<typeof huxfluxServerSchema>

// ── ServerStatus ─────────────────────────────────────────────────────────────

export const serverStatusSchema = z.enum(["online", "offline", "checking", "unauthorized"])

export type ServerStatus = z.infer<typeof serverStatusSchema>
