import * as crypto from "node:crypto"
import { getMeta, setMeta } from "./oauth/db.js"

// The URL-facing server id is derived from the server-provided random key with
// an HMAC keyed by a proxy-only secret. This makes the id deterministic (stable
// across reconnects) but unforgeable: a registering server cannot choose or
// predict its own public URL. The secret is generated once and persisted, so it
// is independent of the JWT signing secret (which may be overridden by env).

let cachedSecret: Buffer | null = null

function idSecret(): Buffer {
  if (cachedSecret) return cachedSecret
  let secret = getMeta("id_secret")
  if (!secret) {
    secret = crypto.randomBytes(32).toString("base64")
    setMeta("id_secret", secret)
  }
  cachedSecret = Buffer.from(secret, "base64")
  return cachedSecret
}

/** Deterministic, proxy-controlled server id (128-bit hex) for a server key. */
export function deriveServerId(serverKey: string): string {
  return crypto.createHmac("sha256", idSecret()).update(serverKey).digest("hex").slice(0, 32)
}
