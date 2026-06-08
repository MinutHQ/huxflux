import pino from "pino"

const isDev = (process.env.NODE_ENV ?? "development") !== "production"

let transport: pino.TransportSingleOptions | undefined
if (isDev) {
  try {
    await import("pino-pretty")
    transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
        singleLine: true,
        messageFormat: "{if domain}[{domain}] {end}{msg}",
      },
    }
  } catch { /* pino-pretty not available in production installs */ }
}

export const rootLogger = pino({ level: "info", ...(transport ? { transport } : {}) })

const BRACKET_RE = /^\[([^\]]+)\]\s*/

function parsePrefix(args: unknown[]): { domain: string | undefined; msg: string; rest: unknown[] } {
  if (args.length === 0 || typeof args[0] !== "string") return { domain: undefined, msg: String(args[0] ?? ""), rest: args.slice(1) }
  const match = args[0].match(BRACKET_RE)
  if (match) return { domain: match[1], msg: args[0].slice(match[0].length), rest: args.slice(1) }
  return { domain: undefined, msg: args[0], rest: args.slice(1) }
}

function buildMsg(msg: string, rest: unknown[]): string {
  if (rest.length === 0) return msg
  const parts = rest.filter((r) => !(r instanceof Error))
  if (parts.length === 0) return msg
  return `${msg} ${parts.map(String).join(" ")}`
}

function findError(rest: unknown[]): Error | undefined {
  return rest.find((r) => r instanceof Error) as Error | undefined
}

const cache = new Map<string, pino.Logger>()
function getLogger(domain: string | undefined): pino.Logger {
  if (!domain) return rootLogger
  let logger = cache.get(domain)
  if (!logger) {
    logger = rootLogger.child({ domain })
    cache.set(domain, logger)
  }
  return logger
}

const originalInfo = console.info.bind(console)
const originalWarn = console.warn.bind(console)
const originalError = console.error.bind(console)

console.info = (...args: unknown[]) => {
  const { domain, msg, rest } = parsePrefix(args)
  getLogger(domain).info(buildMsg(msg, rest))
}

console.warn = (...args: unknown[]) => {
  const { domain, msg, rest } = parsePrefix(args)
  const err = findError(rest)
  if (err) getLogger(domain).warn(err, buildMsg(msg, rest))
  else getLogger(domain).warn(buildMsg(msg, rest))
}

console.error = (...args: unknown[]) => {
  const { domain, msg, rest } = parsePrefix(args)
  const err = findError(rest)
  if (err) getLogger(domain).error(err, buildMsg(msg, rest))
  else getLogger(domain).error(buildMsg(msg, rest))
}

export { originalInfo, originalWarn, originalError }

export function createLogger(domain: string): pino.Logger {
  return getLogger(domain)
}
