import type { IncomingMessage, ServerResponse } from "node:http"
import { OAUTH_PATHS, type ProxyToken } from "@huxflux/shared/proxy"
import { config, isOAuthConfigured } from "../config.js"
import { logger } from "../logger.js"
import { readJsonBody, sendJson, sendHtml, redirect } from "../util.js"
import {
  createSession, getSession, authorizeSession, denySession, consumeToken,
  SESSION_TTL_SEC, POLL_INTERVAL_SEC,
} from "./sessions.js"
import { buildGoogleAuthUrl, exchangeGoogleCode, isDomainAllowed } from "./google.js"
import { signAccessToken } from "./jwt.js"
import { issueRefreshToken, emailForRefreshToken } from "./refresh.js"

function resultPage(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<style>body{font-family:system-ui,sans-serif;background:#f5f3f0;color:#2b2622;` +
    `display:grid;place-items:center;height:100vh;margin:0}div{max-width:28rem;text-align:center;padding:2rem}` +
    `h1{font-size:1.25rem}p{color:#6b6259}</style></head>` +
    `<body><div><h1>${title}</h1><p>${message}</p></div></body></html>`
}

async function mintTokens(email: string): Promise<ProxyToken> {
  const access = await signAccessToken(email)
  return { accessToken: access.token, refreshToken: issueRefreshToken(email), email, expiresIn: access.expiresIn }
}

/** POST /oauth/auth — start a flow. */
export function handleOAuthStart(res: ServerResponse): void {
  if (!isOAuthConfigured()) { sendJson(res, 503, { error: "oauth_not_configured" }); return }
  const session = createSession()
  sendJson(res, 200, {
    authId: session.authId,
    verificationUrl: `${config.publicUrl}${OAUTH_PATHS.authorize}?auth_id=${session.authId}`,
    expiresIn: SESSION_TTL_SEC,
    interval: POLL_INTERVAL_SEC,
  })
}

/** GET /oauth/authorize — browser lands here; redirect to Google consent. */
export function handleAuthorize(res: ServerResponse, url: URL): void {
  if (!isOAuthConfigured()) { sendHtml(res, 503, resultPage("Unavailable", "Sign-in is not configured on this proxy.")); return }
  const authId = url.searchParams.get("auth_id") ?? ""
  const session = getSession(authId)
  if (!session) { sendHtml(res, 400, resultPage("Link expired", "This sign-in link is invalid or has expired. Start again from the app.")); return }
  redirect(res, buildGoogleAuthUrl(session.state))
}

/** GET /oauth/callback — Google redirects back here after consent. */
export async function handleCallback(res: ServerResponse, url: URL): Promise<void> {
  const state = url.searchParams.get("state") ?? ""
  const code = url.searchParams.get("code") ?? ""
  if (!code || !state) {
    denySession(state)
    sendHtml(res, 400, resultPage("Sign-in failed", "Google did not return an authorization code."))
    return
  }
  const identity = await exchangeGoogleCode(code)
  if (!identity) {
    denySession(state)
    sendHtml(res, 400, resultPage("Sign-in failed", "Could not verify your Google account."))
    return
  }
  if (!isDomainAllowed(identity.domain)) {
    denySession(state)
    logger.warn(`rejected sign-in for disallowed domain: ${identity.domain}`)
    sendHtml(res, 403, resultPage("Access denied", `Accounts on “${identity.domain}” are not allowed to use this proxy.`))
    return
  }
  const token = await mintTokens(identity.email)
  const session = authorizeSession(state, token)
  if (!session) { sendHtml(res, 400, resultPage("Link expired", "This sign-in session expired before it completed.")); return }
  logger.info(`authorized ${identity.email}`)
  sendHtml(res, 200, resultPage("Signed in", `You are signed in as ${identity.email}. You can close this window and return to Huxflux.`))
}

/** POST /oauth/token — poll for a device result, or exchange a refresh token. */
export async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req) as { grantType?: string; authId?: string; refreshToken?: string }

  if (body.grantType === "device") {
    const session = getSession(body.authId ?? "")
    if (!session) { sendJson(res, 400, { error: "expired" }); return }
    if (session.status === "denied") { sendJson(res, 400, { error: "denied" }); return }
    if (session.status !== "authorized") { sendJson(res, 400, { error: "authorization_pending" }); return }
    const token = consumeToken(session.authId)
    if (!token) { sendJson(res, 400, { error: "expired" }); return }
    sendJson(res, 200, token)
    return
  }

  if (body.grantType === "refresh_token") {
    const email = body.refreshToken ? emailForRefreshToken(body.refreshToken) : null
    if (!email) { sendJson(res, 400, { error: "invalid_grant" }); return }
    const access = await signAccessToken(email)
    sendJson(res, 200, { accessToken: access.token, refreshToken: body.refreshToken, email, expiresIn: access.expiresIn })
    return
  }

  sendJson(res, 400, { error: "invalid_grant" })
}
