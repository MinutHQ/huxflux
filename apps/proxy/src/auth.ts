import type { IncomingMessage } from "node:http"
import { verifyAccessToken } from "./oauth/jwt.js"
import { extractProxyToken } from "./util.js"

// Authentication for the tunnel. Both servers (registering) and clients
// (requesting) present a signed access token; the proxy derives the owning
// user's email from it and only ever connects a client to a server owned by the
// same email (enforced in the registry / request handlers).

/** Verify a registering server's access token. Returns the owner email or null. */
export function authenticateServerToken(accessToken: string): Promise<string | null> {
  return verifyAccessToken(accessToken)
}

/** Verify a client request's proxy token (header or ?proxy_token=). Returns the
 * owner email or null when missing / invalid / expired. */
export async function authorizeClient(req: IncomingMessage): Promise<string | null> {
  const token = extractProxyToken(req)
  if (!token) return null
  return verifyAccessToken(token)
}
