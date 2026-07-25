import { OAUTH_PATHS } from "@huxflux/shared/proxy"
import { config } from "../config.js"

// Google is the upstream identity provider. The proxy is a confidential OAuth
// client: it redirects the browser to Google consent, then exchanges the code
// server-to-server. The id_token is read directly from that TLS exchange, so we
// trust its claims without a separate JWKS signature check.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

export function redirectUri(): string {
  return `${config.publicUrl}${OAUTH_PATHS.callback}`
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export interface GoogleIdentity {
  email: string
  domain: string
}

interface IdTokenClaims {
  email?: string
  email_verified?: boolean | string
  hd?: string
}

function decodeIdToken(idToken: string): IdTokenClaims | null {
  const parts = idToken.split(".")
  if (parts.length < 2 || !parts[1]) return null
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as IdTokenClaims
  } catch {
    return null
  }
}

/** Exchange an auth code for the user's verified email, or null on any failure. */
export async function exchangeGoogleCode(code: string): Promise<GoogleIdentity | null> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => null) as { id_token?: string } | null
  if (!json?.id_token) return null
  const claims = decodeIdToken(json.id_token)
  if (!claims?.email) return null
  if (claims.email_verified === false || claims.email_verified === "false") return null
  const email = claims.email.toLowerCase()
  const domain = email.split("@")[1] ?? ""
  return { email, domain }
}

export function isDomainAllowed(domain: string): boolean {
  return config.allowedDomains.includes(domain.toLowerCase())
}
