const COLORS: Record<string, string> = {
  runner:      "\x1b[36m",  // cyan
  poller:      "\x1b[35m",  // magenta
  watcher:     "\x1b[33m",  // yellow
  pty:         "\x1b[32m",  // green
  reserve:     "\x1b[34m",  // blue
  db:          "\x1b[90m",  // gray
  ws:          "\x1b[94m",  // bright blue
  server:      "\x1b[97m",  // bright white
  supervisor:  "\x1b[93m",  // bright yellow
  updater:     "\x1b[95m",  // bright magenta
  automation:  "\x1b[96m",  // bright cyan
  automations: "\x1b[96m",
  tasks:       "\x1b[92m",  // bright green
  providers:   "\x1b[90m",
  github:      "\x1b[37m",  // white
  tags:        "\x1b[90m",
  job:         "\x1b[35m",
}

const RESET = "\x1b[0m"
const DIM = "\x1b[2m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"

const BRACKET_RE = /^\[([^\]]+)\]/

function colorizePrefix(args: unknown[]): unknown[] {
  if (args.length === 0 || typeof args[0] !== "string") return args
  const match = args[0].match(BRACKET_RE)
  if (!match) return args
  const tag = match[1]
  const color = COLORS[tag] ?? DIM
  const rest = args[0].slice(match[0].length)
  return [`${color}[${tag}]${RESET}${rest}`, ...args.slice(1)]
}

const originalInfo = console.info.bind(console)
const originalWarn = console.warn.bind(console)
const originalError = console.error.bind(console)

console.info = (...args: unknown[]) => originalInfo(...colorizePrefix(args))
console.warn = (...args: unknown[]) => originalWarn(`${YELLOW}⚠${RESET}`, ...colorizePrefix(args))
console.error = (...args: unknown[]) => originalError(`${RED}✖${RESET}`, ...colorizePrefix(args))
