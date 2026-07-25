// Minimal stdout logger. The proxy is a standalone service with no shared
// pino instance; console.info/warn/error are the allowed presentation channels
// (see the repo lint config). Every line is prefixed so logs are greppable
// when the proxy runs alongside other services.
export const logger = {
  info: (...args: unknown[]) => console.info("[proxy]", ...args),
  warn: (...args: unknown[]) => console.warn("[proxy]", ...args),
  error: (...args: unknown[]) => console.error("[proxy]", ...args),
}
