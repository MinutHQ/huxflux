import * as crypto from "node:crypto"
import { insertRefreshToken, findRefreshEmail, deleteRefreshToken } from "./db.js"

// Opaque refresh tokens. Only their SHA-256 hash is stored, so a leak of the
// database does not leak usable tokens. Long-lived and revocable by deletion;
// not rotated on use in this version.

function hash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function issueRefreshToken(email: string): string {
  const token = crypto.randomBytes(32).toString("base64url")
  insertRefreshToken(hash(token), email, Date.now())
  return token
}

/** Owning email for a presented refresh token, or null if unknown / revoked. */
export function emailForRefreshToken(token: string): string | null {
  return findRefreshEmail(hash(token))
}

export function revokeRefreshToken(token: string): void {
  deleteRefreshToken(hash(token))
}
