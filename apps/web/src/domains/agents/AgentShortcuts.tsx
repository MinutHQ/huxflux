import { useAgentShortcuts } from "./hooks/useAgentShortcuts"

/**
 * Headless mount point for the agent-level keyboard shortcuts (⌘⇧D mark done,
 * ⌘⇧⌫ archive). Rendered once inside the workspace provider — the sidebar
 * can't host them, since it unmounts on the PR / Refine tabs and renders twice
 * while collapsed (panel plus floating overlay), which would double-fire.
 */
export function AgentShortcuts() {
  useAgentShortcuts()
  return null
}
