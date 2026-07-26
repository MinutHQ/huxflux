// Public surface: the CLI's proxy sign-in entrypoint. Kept separate from
// proxy-connector.service.ts so callers that only need the interactive sign-in
// (the CLI setup / proxy commands) don't pull the tunnel client into their
// bundle.
export { authenticateProxy } from "./service/proxyAuthFlow.js"
