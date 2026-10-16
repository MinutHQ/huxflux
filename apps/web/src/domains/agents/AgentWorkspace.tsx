import { AgentErrorBoundary } from "./components/workspace/AgentErrorBoundary"
import { AgentWorkspace as Workspace } from "./components/workspace/AgentWorkspace"

/** The per-agent workspace (chat plus side pane), isolated by an error boundary. */
export function AgentWorkspace({ agentId }: { agentId: string }) {
  return (
    <AgentErrorBoundary key={agentId}>
      <Workspace agentId={agentId} />
    </AgentErrorBoundary>
  )
}
