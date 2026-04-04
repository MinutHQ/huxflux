import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { cn } from "@huxflux/ui"
import { useServers } from "@/hooks/useServers"
import { useServerStatus } from "@/hooks/useServerStatus"
import { setActiveServerId } from "@huxflux/shared"
import {
  IconChevronDown,
  IconServer,
  IconPlus,
  IconLoader2,
  IconAlertCircle,
  IconTrash,
  IconKey,
} from "@tabler/icons-react"
import type { ServerStatus } from "@huxflux/shared"

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ServerStatus }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-400",
        status === "offline" && "bg-red-400",
        status === "checking" && "bg-amber-400 animate-pulse",
        status === "unauthorized" && "bg-amber-400"
      )}
    />
  )
}

// ── Inline add-server form ────────────────────────────────────────────────────

async function validateAuth(url: string, token?: string): Promise<"ok" | "unauthorized" | "unreachable"> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${url}/api/config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) return "unauthorized"
    if (!res.ok) return "unreachable"
    return "ok"
  } catch {
    return "unreachable"
  } finally {
    clearTimeout(timer)
  }
}

function AddServerForm({ onDone }: { onDone: () => void }) {
  const { add } = useServers()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || loading) return
    setError(null)
    setLoading(true)

    const normalizedUrl = url.trim().replace(/\/$/, "")
    const trimmedToken = token.trim()
    try {
      const result = await validateAuth(normalizedUrl, trimmedToken)
      if (result === "unreachable") { setError("Could not reach server. Check the URL."); return }
      if (result === "unauthorized") { setError("Invalid auth token."); return }

      const server = add({ name: name.trim() || "My Server", url: normalizedUrl, token: trimmedToken })
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
      <input
        type="password"
        value={token}
        onChange={(e) => { setToken(e.target.value); setError(null) }}
        placeholder="Auth token"
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
          disabled={!url.trim() || !token.trim() || loading}
          className="text-[12px] bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading && <IconLoader2 size={11} className="animate-spin" />}
          {loading ? "Verifying…" : "Connect"}
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
  const { servers, activeId, setActive, remove, update } = useServers()
  const statuses = useServerStatus(servers)
  const [showAdd, setShowAdd] = useState(false)
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null)
  const [tokenInput, setTokenInput] = useState("")
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [tokenSaving, setTokenSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function handleSaveToken(serverId: string) {
    const server = servers.find((s) => s.id === serverId)
    if (!server || tokenSaving) return
    setTokenError(null)
    setTokenSaving(true)
    try {
      const result = await validateAuth(server.url, tokenInput.trim() || undefined)
      if (result === "unauthorized") { setTokenError("Invalid token — auth still failing."); return }
      if (result === "unreachable") { setTokenError("Server unreachable."); return }
      update(serverId, { token: tokenInput.trim() || undefined })
    } finally {
      setTokenSaving(false)
    }
  }

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
        {servers.map((server) => {
          const isActive = server.id === activeId
          const status = statuses[server.id] ?? "checking"
          const isEditingToken = editingTokenId === server.id
          return (
            <div key={server.id} className={cn("rounded-md", isActive && "bg-accent")}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <StatusDot status={status} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-foreground truncate">{server.name}</div>
                  {status === "unauthorized"
                    ? <div className="text-[11px] text-amber-400 truncate">Auth failed — token invalid</div>
                    : <div className="text-[11px] font-mono text-muted-foreground/60 truncate">{server.url}</div>
                  }
                </div>
                {status === "unauthorized" && (
                  <button
                    onClick={() => { setEditingTokenId(isEditingToken ? null : server.id); setTokenInput(server.token ?? "") }}
                    className="p-1 text-amber-400 hover:text-amber-300 transition-colors rounded shrink-0"
                    title="Update token"
                  >
                    <IconKey size={12} />
                  </button>
                )}
                {!isActive && (
                  <button
                    onClick={() => { setActive(server.id); onClose() }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-accent/60"
                  >
                    Switch
                  </button>
                )}
                <button
                  onClick={() => remove(server.id)}
                  className="p-1 text-muted-foreground/40 hover:text-red-400 transition-colors rounded shrink-0"
                >
                  <IconTrash size={12} />
                </button>
              </div>
              {isEditingToken && (
                <div className="px-2.5 pb-2.5 space-y-1.5">
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      type="password"
                      value={tokenInput}
                      onChange={(e) => { setTokenInput(e.target.value); setTokenError(null) }}
                      placeholder="Paste token…"
                      className="flex-1 text-[11px] font-mono bg-background border border-input rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring"
                    />
                    <button
                      onClick={() => handleSaveToken(server.id)}
                      disabled={tokenSaving || !tokenInput.trim()}
                      className="text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 font-medium disabled:opacity-50 flex items-center gap-1"
                    >
                      {tokenSaving && <IconLoader2 size={10} className="animate-spin" />}
                      {tokenSaving ? "Checking…" : "Save"}
                    </button>
                  </div>
                  {tokenError && (
                    <div className="flex items-center gap-1 text-[11px] text-red-400">
                      <IconAlertCircle size={10} />
                      {tokenError}
                    </div>
                  )}
                </div>
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
  const isUnauthorized = activeStatus === "unauthorized"

  return (
    <>
      <button
        ref={triggerRef}
        onMouseDown={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-sidebar-accent/60 transition-colors text-left"
      >
        <div className="w-5 h-5 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <IconServer size={11} className="text-primary" />
        </div>
        <span className={cn("text-[12px] font-medium flex-1 min-w-0 truncate", isUnauthorized ? "text-amber-400" : "text-sidebar-foreground")}>
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
