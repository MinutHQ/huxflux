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
  // Optional switcher appearance picked by the user. Both are keys the web
  // client maps to an icon / color; unknown keys fall back to initials and
  // the neutral tile, so other clients can ignore them safely.
  icon: z.string().optional(),
  color: z.string().optional(),
  // Uploaded or generated tile image as a data: URL (PNG or SVG). Wins over
  // `icon` when set.
  iconImage: z.string().optional(),
  addedAt: z.string(),
})

export type HuxfluxServer = z.infer<typeof huxfluxServerSchema>

// ── ServerStatus ─────────────────────────────────────────────────────────────

export const serverStatusSchema = z.enum(["online", "offline", "checking", "unauthorized"])

export type ServerStatus = z.infer<typeof serverStatusSchema>

// ── ServerAttention ──────────────────────────────────────────────────────────

// What a server needs from the user, served by GET /api/attention so other
// servers' switchers can badge it without pulling the full agent list.
// `waiting` agents are blocked on a question card; `unread` agents finished a
// turn nobody has opened yet. An agent counts in one bucket only, `waiting`
// first. `items` is capped and ordered most recent first.
export const attentionReasonSchema = z.enum(["waiting", "unread"])

export const attentionItemSchema = z.object({
  agentId: z.string(),
  title: z.string(),
  reason: attentionReasonSchema,
})

export const serverAttentionSchema = z.object({
  waiting: z.number(),
  unread: z.number(),
  items: z.array(attentionItemSchema),
})

export type AttentionReason = z.infer<typeof attentionReasonSchema>
export type AttentionItem = z.infer<typeof attentionItemSchema>
export type ServerAttention = z.infer<typeof serverAttentionSchema>
