import * as fs from "node:fs"
import * as path from "node:path"
import { DATA_DIR } from "../../../config.js"

// Persists the connector's proxy credentials so it does not re-run the sign-in
// flow on every restart. A plain JSON file in the Huxflux data dir; it holds
// bearer material, so it is written with owner-only permissions.

export interface StoredProxyAuth {
  accessToken: string
  refreshToken: string
  email: string
  /** Epoch ms when the access token expires. */
  accessExpiresAt: number
}

const FILE = path.join(DATA_DIR, "proxy-auth.json")

export function loadProxyAuth(): StoredProxyAuth | null {
  try {
    const raw = fs.readFileSync(FILE, "utf8")
    const parsed = JSON.parse(raw) as Partial<StoredProxyAuth>
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.email) return null
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      email: parsed.email,
      accessExpiresAt: parsed.accessExpiresAt ?? 0,
    }
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

/** Drop the access token (keep the refresh token) so the next fetch refreshes. */
export function invalidateStoredAccess(): void {
  const auth = loadProxyAuth()
  if (auth) saveProxyAuth({ ...auth, accessToken: "", accessExpiresAt: 0 })
}
