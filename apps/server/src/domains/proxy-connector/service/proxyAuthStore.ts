import * as fs from "node:fs"
import * as path from "node:path"
import * as crypto from "node:crypto"
import { DATA_DIR } from "../../../config.js"

// Persists the connector's proxy credentials so it does not re-run the sign-in
// flow on every restart. A plain JSON file in the Huxflux data dir; it holds
// bearer material, so it is written with owner-only permissions.
//
// The `serverKey` is a stable random string the connector generates once and
// presents on every registration; the proxy derives the public URL id from it.
// It lives here (next to the refresh token) so the server keeps the same URL
// across restarts and re-authentications.

export interface StoredProxyAuth {
  serverKey?: string
  accessToken?: string
  refreshToken?: string
  email?: string
  /** Epoch ms when the access token expires. */
  accessExpiresAt?: number
}

const FILE = path.join(DATA_DIR, "proxy-auth.json")

export function loadProxyAuth(): StoredProxyAuth | null {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as StoredProxyAuth
  } catch {
    return null
  }
}

export function saveProxyAuth(auth: StoredProxyAuth): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(auth, null, 2), { mode: 0o600 })
  } catch {
    /* best effort — a failed write just means we re-auth next start */
  }
}

/** Merge a patch into the stored record without dropping other fields. */
export function patchProxyAuth(patch: Partial<StoredProxyAuth>): void {
  saveProxyAuth({ ...(loadProxyAuth() ?? {}), ...patch })
}

/** Drop the access token (keep the refresh token + server key) so the next
 * fetch refreshes. */
export function invalidateStoredAccess(): void {
  patchProxyAuth({ accessToken: "", accessExpiresAt: 0 })
}

/** The stable random key this server registers with, generated once on demand. */
export function getOrCreateServerKey(): string {
  const existing = loadProxyAuth()?.serverKey
  if (existing) return existing
  const serverKey = crypto.randomBytes(32).toString("base64url")
  patchProxyAuth({ serverKey })
  return serverKey
}
