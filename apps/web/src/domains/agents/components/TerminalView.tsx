import { useRepos, type Agent } from "@huxflux/shared"
import { TerminalTabBar } from "./terminal/TerminalTabBar"
import { TerminalSearchBar } from "./terminal/TerminalSearchBar"
import { TerminalRunPanel } from "./terminal/TerminalRunPanel"
import { useTerminalTabs } from "../hooks/useTerminalTabs"
import { useTerminalSession } from "../hooks/useTerminalSession"
import { useTerminalSearch } from "../hooks/useTerminalSearch"
import { getOrCreateSession } from "../terminalSession"
import type { TerminalTopTab } from "../agents.types"
import "@xterm/xterm/css/xterm.css"

interface TerminalViewProps {
  agent: Agent
  activeTab: TerminalTopTab
  onTabChange: (tab: TerminalTopTab) => void
  onOpenSettings: () => void
  onPortChange?: (agentId: string, port: number | null) => void
}

/**
 * Per-agent terminal viewer. Hosts a tab strip of long-lived xterm sessions
 * (sessions live in a module-level store so they survive component remounts),
 * a Cmd+F search bar, and "setup" / "run" overlays driven by the top tab.
 */
export function TerminalView({ agent, activeTab, onTabChange, onOpenSettings, onPortChange }: TerminalViewProps) {
  const { data: repos = [] } = useRepos()
  const repo = repos.find((r) => r.id === agent.repoId)

  const { tabs, activeTerminalId, tabsLoaded, setActiveTerminalId, addTab, renameTab, closeTab } = useTerminalTabs(agent.id)
  const search = useTerminalSearch()

  const { wrapperRef, setIsRunning, setDetectedPort } = useTerminalSession({
    agentId: agent.id,
    activeTerminalId,
    activeTab,
    tabsLoaded,
    onPortChange,
  })

  async function handleAdd() {
    const created = await addTab()
    if (created) onTabChange("terminal")
  }

  function handleTabSelect(terminalId: string) {
    onTabChange("terminal")
    setActiveTerminalId(terminalId)
  }

  function handleRun() {
    if (!repo?.runScript) return
    onTabChange("terminal")
    const key = `${agent.id}:${activeTerminalId}`
    const session = getOrCreateSession(key)
    session.isRunning = true
    session.port = null
    setIsRunning(true)
    setDetectedPort(null)
    onPortChange?.(agent.id, null)
    setTimeout(() => {
      if (session.ws?.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ type: "input", data: repo.runScript + "\r" }))
      }
    }, 300)
  }

  return (
    <div className="flex flex-col h-full">
      <TerminalTabBar
        tabs={tabs}
        activeTerminalId={activeTerminalId}
        isTerminalTabActive={activeTab === "terminal"}
        onSelect={handleTabSelect}
        onAdd={handleAdd}
        onClose={closeTab}
        onRename={renameTab}
      />

      {search.showSearch && (
        <TerminalSearchBar
          agentId={agent.id}
          activeTerminalId={activeTerminalId}
          query={search.query}
          setQuery={search.setQuery}
          inputRef={search.inputRef}
          onClose={search.close}
        />
      )}

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div ref={wrapperRef} className="absolute inset-0" />

        {activeTab === "run" && (
          <TerminalRunPanel
            runScript={repo?.runScript ?? undefined}
            onRun={handleRun}
            onOpenSettings={onOpenSettings}
          />
        )}

        {activeTab === "setup" && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-sm bg-background z-10">
            Setup output appears here during agent creation
          </div>
        )}
      </div>
    </div>
  )
}
