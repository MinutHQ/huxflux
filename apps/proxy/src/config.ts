// Proxy configuration, all via environment variables.
//
// Auth is intentionally minimal for now (see auth.ts): when the two secrets
// below are unset the proxy accepts any server registration and any client.
// The hooks exist so real authentication can be layered on later without
// touching the tunneling code.
export const config = {
  /** TCP port the proxy listens on for both client traffic and server tunnels. */
  port: parseInt(process.env.PORT ?? "8080", 10),
  /** Interface to bind. Public deployments keep the default. */
  host: process.env.HOST ?? "0.0.0.0",
  /** Optional shared secret every registering server must present. Empty = open. */
  serverSecret: process.env.PROXY_SERVER_SECRET ?? "",
  /** Optional bearer token every client must present to reach a server. Empty = open. */
  clientToken: process.env.PROXY_CLIENT_TOKEN ?? "",
}

export const PROXY_VERSION = "0.0.0"
