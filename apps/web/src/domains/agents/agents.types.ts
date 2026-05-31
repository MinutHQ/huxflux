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
