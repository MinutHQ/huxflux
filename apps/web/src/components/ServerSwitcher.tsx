import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { useServers } from "@/hooks/useServers"
import { useServerStatus } from "@/hooks/useServerStatus"
import { setActiveServerId } from "@/lib/serverStore"
import {
  IconChevronDown,
  IconServer,
  IconPlus,
  IconLoader2,
  IconAlertCircle,
} from "@tabler/icons-react"

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "online" | "offline" | "checking" }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-400",
        status === "offline" && "bg-red-400",
        status === "checking" && "bg-amber-400 animate-pulse"
      )}
    />
  )
}

// ── Inline add-server form ────────────────────────────────────────────────────

function AddServerForm({ onDone }: { onDone: () => void }) {
  const { add } = useServers()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || loading) return
    setError(null)
    setLoading(true)

    const normalizedUrl = url.trim().replace(/\/$/, "")
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      let ok = false
      try {
        const res = await fetch(`${normalizedUrl}/health`, { signal: controller.signal })
        ok = res.ok
      } finally {
        clearTimeout(timer)
      }

      if (!ok) {
        setError("Server returned an error. Check the URL.")
        return
      }

      const server = add({ name: name.trim() || "My Server", url: normalizedUrl })
      setActiveServerId(server.id)
      onDone()
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Connection timed out.")
      } else {
        setError("Could not reach server.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-border space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        Add server
      </div>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My Machine"
        className="w-full text-[12px] bg-background border border-input rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
      <input
        type="url"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(null) }}
        placeholder="http://localhost:3001"
        className="w-full text-[12px] font-mono bg-background border border-input rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-400">
          <IconAlertCircle size={11} />
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!url.trim() || loading}
          className="text-[12px] bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading && <IconLoader2 size={11} className="animate-spin" />}
          {loading ? "Connecting…" : "Connect"}
        </button>
      </div>
    </form>
  )
}

// ── Dropdown portal ───────────────────────────────────────────────────────────

interface DropdownProps {
  anchorRect: DOMRect
  onClose: () => void
}

function ServerDropdown({ anchorRect, onClose }: DropdownProps) {
  const { servers, activeId, setActive } = useServers()
  const statuses = useServerStatus(servers)
  const [showAdd, setShowAdd] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  const top = anchorRect.bottom + 6
  const left = anchorRect.left

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-64 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      style={{ top, left }}
    >
      <div className="p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
        {servers.map((server) => {
          const isActive = server.id === activeId
          const status = statuses[server.id] ?? "checking"
          return (
            <div
              key={server.id}
              className={cn(
                "flex items-center gap-2 px-2.5 py-2 rounded-md",
                isActive && "bg-accent"
              )}
            >
              <StatusDot status={status} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground truncate">{server.name}</div>
                <div className="text-[11px] font-mono text-muted-foreground/60 truncate">{server.url}</div>
              </div>
              {!isActive && (
                <button
                  onClick={() => {
                    setActive(server.id)
                    onClose()
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-accent/60"
                >
                  Switch
                </button>
              )}
            </div>
          )
        })}
        {servers.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/50">
            No servers configured
          </div>
        )}
      </div>

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

// ── Main component ────────────────────────────────────────────────────────────

export function ServerSwitcher() {
  const { servers, activeServer } = useServers()
  const statuses = useServerStatus(servers)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeStatus = activeServer ? (statuses[activeServer.id] ?? "checking") : "checking"

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-sidebar-accent/60 transition-colors text-left"
      >
        <div className="w-5 h-5 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <IconServer size={11} className="text-primary" />
        </div>
        <span className="text-[12px] font-medium text-sidebar-foreground flex-1 min-w-0 truncate">
          {activeServer?.name ?? "No server"}
        </span>
        <StatusDot status={activeStatus} />
        <IconChevronDown
          size={12}
          className={cn(
            "text-muted-foreground/50 shrink-0 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {open && triggerRef.current && (
        <ServerDropdown
          anchorRect={triggerRef.current.getBoundingClientRect()}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
