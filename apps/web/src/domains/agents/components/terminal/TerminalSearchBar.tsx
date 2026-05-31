import { IconX } from "@tabler/icons-react"
import { globalSessions } from "../../terminalSession"

interface TerminalSearchBarProps {
  agentId: string
  activeTerminalId: string
  query: string
  setQuery: (q: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onClose: () => void
}

/** Cmd+F search bar over the active terminal, driven by xterm's SearchAddon. */
export function TerminalSearchBar({
  agentId,
  activeTerminalId,
  query,
  setQuery,
  inputRef,
  onClose,
}: TerminalSearchBarProps) {
  function getActiveSession() {
    return globalSessions.get(`${agentId}:${activeTerminalId}`)
  }

  function close() {
    onClose()
    getActiveSession()?.searchAddon.clearDecorations()
  }

  function handleChange(value: string) {
    setQuery(value)
    const session = getActiveSession()
    if (session && value) {
      session.searchAddon.findNext(value, { regex: false, caseSensitive: false, incremental: true })
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return close()
    if (e.key === "Enter") {
      const session = getActiveSession()
      if (session && query) {
        if (e.shiftKey) session.searchAddon.findPrevious(query)
        else session.searchAddon.findNext(query)
      }
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card shrink-0">
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Search terminal..."
        className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/40"
      />
      <span className="text-[10px] text-muted-foreground/30">
        <kbd className="border border-border rounded px-1 py-0.5 font-mono">↵</kbd> next
        <kbd className="border border-border rounded px-1 py-0.5 font-mono ml-1">⇧↵</kbd> prev
      </span>
      <button onClick={close} className="text-muted-foreground/40 hover:text-muted-foreground">
        <IconX size={12} />
      </button>
    </div>
  )
}
