import {
  IconCode,
  IconDatabase,
  IconFolder,
  IconTerminal,
  IconTerminal2,
} from "@tabler/icons-react"
import type { OpenInApp } from "./agents.types"

/** Editors / file managers the header's "Open in" split-button can dispatch to. */
export const OPEN_IN_APPS: readonly OpenInApp[] = [
  { key: "finder",   label: "Finder",   Icon: IconFolder,    shortcut: "1" },
  { key: "vscode",   label: "VS Code",  Icon: IconCode,      shortcut: "2" },
  { key: "cursor",   label: "Cursor",   Icon: IconCode,      shortcut: "3" },
  { key: "iterm",    label: "iTerm",    Icon: IconTerminal,  shortcut: "4" },
  { key: "terminal", label: "Terminal", Icon: IconTerminal2, shortcut: "5" },
  { key: "datagrip", label: "DataGrip", Icon: IconDatabase,  shortcut: "6" },
]

/** Persisted user preference: which editor was last used via "Open in". */
export const OPEN_IN_KEY = "huxflux:open-in-last"

/** Editors that can launch a remote SSH session (for the `remoteEditor` flag). */
export const SSH_CAPABLE_EDITORS = ["vscode", "cursor"]

/** localStorage key prefix for "which terminal tab was last active per agent". */
export const TERMINAL_ACTIVE_TAB_KEY = "huxflux-terminal-active-"

/** Regex stripping ANSI color/control sequences and CR so port-scanning is text-only. */
// eslint-disable-next-line no-control-regex
export const ANSI_RE = /\x1b\[[0-9;]*[mGKHF]|\x1b\][^\x07]*\x07|\r/g

/** Patterns that reveal an HTTP server port in terminal output (dev-server detection). */
export const PORT_PATTERNS: readonly RegExp[] = [
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/,
  /(?:port|PORT)[^\d]*(\d{4,5})/,
  /:(\d{4,5})\//,
]
