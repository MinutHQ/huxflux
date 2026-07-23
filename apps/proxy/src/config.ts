// Proxy configuration, all via environment variables.
//
// Authentication delegates to Google. Clients and servers obtain a signed
// access token (JWT) through the OAuth flow, and the proxy only connects a
// client to a server owned by the same authenticated user. The auth *flow*
// needs Google credentials + an allowed domain + the public URL; JWT
// verification only needs the signing secret (auto-generated + persisted when
// PROXY_JWT_SECRET is unset).
export const config = {
  /** TCP port the proxy listens on for both client traffic and server tunnels. */
  port: parseInt(process.env.PORT ?? "8080", 10),
  /** Interface to bind. Public deployments keep the default. */
  host: process.env.HOST ?? "0.0.0.0",

  /** Google OAuth client credentials (confidential client). */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  /** Allowed email domains, comma-separated (e.g. "minut.com"). Empty = flow disabled. */
  allowedDomains: (process.env.PROXY_ALLOWED_DOMAIN ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  /** Public base URL clients reach, e.g. https://proxy.example.com. Builds redirect URIs. */
  publicUrl: (process.env.PROXY_PUBLIC_URL ?? "").replace(/\/+$/, ""),

  /** HS256 signing secret. Auto-generated + persisted in the DB when unset. */
  jwtSecret: process.env.PROXY_JWT_SECRET ?? "",
  /** Access-token lifetime in seconds (default 1h). */
  accessTokenTtlSec: parseInt(process.env.PROXY_ACCESS_TTL ?? "3600", 10),
  /** On-disk SQLite database for refresh tokens + generated secrets. */
  dbPath: process.env.PROXY_DB_PATH ?? "./huxflux-proxy.db",
}

export const PROXY_VERSION = "0.0.0"

/** True when the interactive OAuth flow can run (Google + domain + public URL set). */
export function isOAuthConfigured(): boolean {
  return Boolean(
    config.googleClientId &&
    config.googleClientSecret &&
    config.allowedDomains.length > 0 &&
    config.publicUrl,
  )
}
