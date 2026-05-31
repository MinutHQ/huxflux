import {
  IconFolder,
  IconCode,
  IconTerminal,
  IconTerminal2,
  IconDatabase,
} from "@tabler/icons-react"
import type { SetupStep } from "./chat.types"

export const OPEN_IN_APPS = [
  { key: "finder",   label: "Finder",   Icon: IconFolder,    shortcut: "1" },
  { key: "vscode",   label: "VS Code",  Icon: IconCode,      shortcut: "2" },
  { key: "cursor",   label: "Cursor",   Icon: IconCode,      shortcut: "3" },
  { key: "iterm",    label: "iTerm",    Icon: IconTerminal,  shortcut: "4" },
  { key: "terminal", label: "Terminal", Icon: IconTerminal2, shortcut: "5" },
  { key: "datagrip", label: "DataGrip", Icon: IconDatabase,  shortcut: "6" },
] as const

export const OPEN_IN_KEY = "huxflux:open-in-last"
export const SSH_CAPABLE_EDITORS = ["vscode", "cursor"]

// Fallback models when providers API hasn't loaded yet
export const FALLBACK_MODELS = [
  { id: "claude-opus-4-7",           label: "Opus 4.7",   provider: "claude" },
  { id: "claude-opus-4-6",           label: "Opus 4.6",   provider: "claude" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6", provider: "claude" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",  provider: "claude" },
]

export const PR_URL_RE = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/g

export const SETUP_STEPS: SetupStep[] = [
  { label: "Creating branch", icon: "⑂" },
  { label: "Setting up worktree", icon: "⬡" },
  { label: "Scaffolding workspace", icon: "⧉" },
  { label: "Linking dependencies", icon: "⇄" },
  { label: "Initializing environment", icon: "◈" },
]

export const TEARDOWN_STEPS: SetupStep[] = [
  { label: "Stopping processes", icon: "◼" },
  { label: "Removing worktree", icon: "⑂" },
  { label: "Cleaning up", icon: "✕" },
]
