import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconLoader2, IconAlertCircle, IconTrash, IconKey } from "@tabler/icons-react"
import type { ServerStatus, HuxfluxServer } from "@huxflux/shared"
import { StatusDot } from "./StatusDot"
import { validateAuth } from "./validateAuth"

interface ServerRowProps {
  server: HuxfluxServer
  status: ServerStatus
  isActive: boolean
  onSetActive: () => void
  onRemove: () => void
  onUpdateToken: (token: string | undefined) => void
}

/**
 * A single row inside the server dropdown: status dot, name/URL, optional
 * inline token-edit form (for `unauthorized` servers), Switch button, and
 * remove button. Token-edit state is local to the row so multiple rows can't
 * be in edit mode at once.
 */
export function ServerRow({ server, status, isActive, onSetActive, onRemove, onUpdateToken }: ServerRowProps) {
  const [editing, setEditing] = useState(false)
  const [tokenInput, setTokenInput] = useState("")
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [tokenSaving, setTokenSaving] = useState(false)

  function toggleEdit() {
    setEditing((v) => !v)
    setTokenInput(server.token ?? "")
    setTokenError(null)
  }

  async function handleSave() {
    if (tokenSaving) return
    setTokenError(null)
    setTokenSaving(true)
    try {
      const result = await validateAuth(server.url, tokenInput.trim() || undefined)
      if (result === "unauthorized") { setTokenError("Invalid token — auth still failing."); return }
      if (result === "unreachable") { setTokenError("Server unreachable."); return }
      onUpdateToken(tokenInput.trim() || undefined)
    } finally {
      setTokenSaving(false)
    }
  }

  return (
    <div className={cn("rounded-md", isActive && "bg-accent")}>
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
            onClick={toggleEdit}
            className="p-1 text-amber-400 hover:text-amber-300 transition-colors rounded shrink-0"
            title="Update token"
          >
            <IconKey size={12} />
          </button>
        )}
        {!isActive && (
          <button
            onClick={onSetActive}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-accent/60"
          >
            Switch
          </button>
        )}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1 text-muted-foreground/40 hover:text-red-400 transition-colors rounded hover:bg-accent shrink-0"
          title="Remove server"
        >
          <IconTrash size={12} />
        </button>
      </div>
      {editing && (
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
              onClick={handleSave}
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
}
