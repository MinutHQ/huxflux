import { useRef, useState } from "react"
import { isTerminalSearchShortcut } from "../terminalSession"

/**
 * Cmd+F (Ctrl+Shift+F off macOS) opens an in-terminal search input. The key
 * handler is attached to the terminal view, so the shortcut only fires while
 * focus is inside the terminal and the browser's find works everywhere else.
 */
export function useTerminalSearch() {
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isTerminalSearchShortcut(e)) return
    e.preventDefault()
    setShowSearch(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function close() {
    setShowSearch(false)
    setQuery("")
  }

  return { showSearch, query, setQuery, inputRef, close, setShowSearch, handleKeyDown }
}
