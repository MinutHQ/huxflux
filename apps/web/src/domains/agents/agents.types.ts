import type { Terminal, IDisposable } from "@xterm/xterm"
import type { FitAddon } from "@xterm/addon-fit"
import type { SearchAddon } from "@xterm/addon-search"

/** How the agent list is grouped in the sidebar. Persisted per-user in localStorage. */
export type GroupByMode = "status" | "repo"

/** Local creation-status marker rendered above the in-progress group while a worktree is being set up. */
export interface PendingAgentInfo {
  title: string
  branch: string
  repoName: string
  estimatedMs?: number
}

/** A long-lived xterm session, keyed by `${agentId}:${terminalId}` in the module-level store. */
export interface TerminalSession {
  term: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  ws: WebSocket | null
  div: HTMLDivElement
  port: number | null
  isRunning: boolean
  outputBuf: string
  onDataDisposable: IDisposable | null
  /** Where the socket connects; set on the first `connectSession`, reused by reconnects. */
  target: TerminalSessionTarget | null
  /** The shell exited; the next keystroke starts a new one. */
  exited: boolean
  /** The server refused the terminal (agent gone, bad cwd); do not reconnect. */
  fatal: boolean
  /** Torn down by `closeTerminalSession`; late socket events are ignored. */
  disposed: boolean
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  /** Input typed (or sent by Run) before the socket opened, flushed on open. */
  pendingInput: string[]
  /** Last `cols x rows` sent to the PTY, so unchanged sizes are not re-sent. */
  sentSize: string | null
}

/** Connection target for a terminal session. */
export interface TerminalSessionTarget {
  agentId: string
  terminalId: string
  onPortDetected?: (port: number) => void
}

/** A persisted terminal tab row owned by the server, surfaced in the UI tab strip. */
export interface TerminalTab {
  /** Row id from the server DB. */
  id: string
  /** PTY key suffix (e.g. `t1`). Combined with agent id this keys the local session. */
  terminalId: string
  orderIdx: number
  label?: string
}

/** Which top-level tab the terminal panel is showing. */
export type TerminalTopTab = "setup" | "run" | "terminal"

/** Open-in-editor target definition used by the header's split-button dropdown. */
export interface OpenInApp {
  key: string
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
  shortcut: string
}

/** SSH connection details surfaced when running against a remote server. */
export interface SshInfo {
  host: string
  port: number
  user: string
  configured: boolean
}

/** A top section of the agent workspace side pane. Only one shows at a time. */
export type SidePaneSection = "diff" | "files" | "pr"

/** Persisted per-agent side pane layout. */
export interface SidePaneLayout {
  /** Visible top section, or null when only the terminal (or nothing) shows. */
  top: SidePaneSection | null
  /** Last opened top section, reopened by Cmd/Ctrl+U. */
  lastTop: SidePaneSection
  terminal: boolean
  maximized: "top" | "terminal" | null
}
