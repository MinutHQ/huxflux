import { DatabaseSync } from "node:sqlite"
import { config } from "../config.js"

// Minimal on-disk store: valid refresh tokens (stored hashed) and generated
// runtime secrets (the JWT signing key and the server-id HMAC key when not
// provided via env). node:sqlite is the same engine the Huxflux server uses, so
// no new dependency.

const db = new DatabaseSync(config.dbPath)
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS proxy_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

export function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM proxy_meta WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO proxy_meta (key, value) VALUES (?, ?)").run(key, value)
}

export function insertRefreshToken(tokenHash: string, email: string, createdAt: number): void {
  db.prepare("INSERT OR REPLACE INTO refresh_tokens (token_hash, email, created_at) VALUES (?, ?, ?)")
    .run(tokenHash, email, createdAt)
}

/** Returns the owning email for a refresh-token hash, or null if unknown/revoked. */
export function findRefreshEmail(tokenHash: string): string | null {
  const row = db.prepare("SELECT email FROM refresh_tokens WHERE token_hash = ?").get(tokenHash) as { email: string } | undefined
  return row?.email ?? null
}

export function deleteRefreshToken(tokenHash: string): void {
  db.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").run(tokenHash)
}
