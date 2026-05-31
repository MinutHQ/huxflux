import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { useServers } from "@/hooks/useServers"
import { useServerStatus, setActiveServerId, addServer } from "@huxflux/shared"
import { IconPlus, IconServer } from "@tabler/icons-react"
import { AddServerForm } from "./AddServerForm"
import { ServerRow } from "./ServerRow"

interface DropdownProps {
  anchorRect: DOMRect
  onClose: () => void
}

/**
 * Portal-rendered dropdown anchored above the ServerSwitcher trigger button.
 * Lists every configured server (with status), exposes Switch/Remove/edit-token
 * affordances, and folds in `AddServerForm` for new entries. Closes on
 * outside click.
 */
export function ServerDropdown({ anchorRect, onClose }: DropdownProps) {
  const { servers, activeId, setActive, remove, update, refresh } = useServers()
  const statuses = useServerStatus(servers)
  const [showAdd, setShowAdd] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Check if there's a local server available that isn't connected. The state
  // derives from localStorage + the current servers list; the effect only
  // resolves a side effect (localStorage cleanup) plus mirrors the current
  // localStorage shape into state for the JSX below.
  const [localServerHint, setLocalServerHint] = useState<{ url: string; token: string } | null>(null)
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem("huxflux-local-server")
    } catch {
      // localStorage unavailable (SSR / private mode), nothing to suggest.
      return
    }
    if (!raw) return
    try {
      const conn = JSON.parse(raw) as { url: string; token: string }
      const normalizeUrl = (u: string) => u.replace("://localhost", "://127.0.0.1")
      const alreadyConnected = servers.some((s) => normalizeUrl(s.url) === normalizeUrl(conn.url))
      if (alreadyConnected) {
        localStorage.removeItem("huxflux-local-server")
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalServerHint(conn)
      }
    } catch {
      // Malformed JSON, drop the entry so it stops re-firing.
      try { localStorage.removeItem("huxflux-local-server") } catch { /* ignore */ }
    }
  }, [servers])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  const bottom = window.innerHeight - anchorRect.top + 6
  const left = anchorRect.left

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-64 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      style={{ bottom, left }}
    >
      <div className="p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
        {servers.map((server) => (
          <ServerRow
            key={server.id}
            server={server}
            status={statuses[server.id] ?? "checking"}
            isActive={server.id === activeId}
            onSetActive={() => { setActive(server.id); onClose() }}
            onRemove={() => remove(server.id)}
            onUpdateToken={(token) => update(server.id, { token })}
          />
        ))}
        {servers.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/50">
            No servers configured
          </div>
        )}
      </div>

      {localServerHint && (
        <div className="border-t border-border p-1.5">
          <button
            onClick={() => {
              const server = addServer({ name: "Local Server", url: localServerHint.url, token: localServerHint.token })
              setActiveServerId(server.id)
              localStorage.removeItem("huxflux-local-server")
              setLocalServerHint(null)
              refresh()
              onClose()
            }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[12px] text-emerald-400 hover:bg-accent/60 transition-colors"
          >
            <IconServer size={13} />
            <div className="flex-1 min-w-0 text-left">
              <div className="font-medium">Local server found</div>
              <div className="text-[11px] font-mono text-muted-foreground/60 truncate">{localServerHint.url}</div>
            </div>
            <span className="text-[11px] shrink-0">Connect</span>
          </button>
        </div>
      )}

      {showAdd ? (
        <AddServerForm onDone={() => { setShowAdd(false); onClose() }} />
      ) : (
        <div className="border-t border-border p-1.5">
          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            <IconPlus size={13} />
            Add server
          </button>
        </div>
      )}
    </div>,
    document.body
  )
}
