import { Component, type ReactNode } from "react"

/** Catches a crash inside one agent's workspace so the rest of the app keeps working. */
export class AgentErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("Agent view crashed:", error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 items-center justify-center h-full">
          <div className="max-w-sm space-y-3 text-center p-6">
            <p className="text-sm font-medium text-foreground">This agent view crashed</p>
            <p className="text-xs text-muted-foreground">{this.state.error.message}</p>
            <p className="text-xs text-muted-foreground/60">You can switch to another agent from the sidebar, or retry below.</p>
            <button className="text-xs underline text-muted-foreground" onClick={() => this.setState({ error: null })}>
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
