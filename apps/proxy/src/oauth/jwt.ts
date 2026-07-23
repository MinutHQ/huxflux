import * as crypto from "node:crypto"
import { SignJWT, jwtVerify } from "jose"
import { config } from "../config.js"
import { getMeta, setMeta } from "./db.js"

// HS256 access tokens. The proxy is the only party that signs and verifies
// them, so a symmetric secret is sufficient. The secret comes from
// PROXY_JWT_SECRET, or is generated once and persisted so it survives restarts.

let cachedKey: Uint8Array | null = null

function signingKey(): Uint8Array {
  if (cachedKey) return cachedKey
  let secret = config.jwtSecret
  if (!secret) {
    secret = getMeta("jwt_secret") ?? ""
    if (!secret) {
      secret = crypto.randomBytes(32).toString("base64")
      setMeta("jwt_secret", secret)
    }
  }
  cachedKey = new TextEncoder().encode(secret)
  return cachedKey
}

export async function signAccessToken(email: string): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = config.accessTokenTtlSec
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(signingKey())
  return { token, expiresIn }
}

/** Returns the token's email if the signature and expiry are valid, else null. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] })
    return typeof payload.email === "string" ? payload.email : null
  } catch {
    return null
  }
}
