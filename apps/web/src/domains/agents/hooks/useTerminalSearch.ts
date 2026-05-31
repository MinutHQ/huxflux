import { useEffect, useRef, useState } from "react"

/** Cmd+F / Ctrl+F opens an in-terminal search input. */
export function useTerminalSearch() {
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function close() {
    setShowSearch(false)
    setQuery("")
  }

  return { showSearch, query, setQuery, inputRef, close, setShowSearch }
}
