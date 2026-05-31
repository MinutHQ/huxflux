import { useState, type FormEvent } from "react"
import { Button } from "@huxflux/ui"
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconCheck,
  IconLoader2,
  IconAlertCircle,
  IconCloud,
} from "@tabler/icons-react"
import { parseConnectionString, type HuxfluxServer } from "@huxflux/shared"
import { useServers } from "@/hooks/useServers"
import { useServerStatus } from "@/hooks/useServerStatus"
import { SettingsStatusDot } from "../components/SettingsStatusDot"

export function ServersSettings() {
  const { servers, activeId, setActive, update, remove } = useServers()
  const statuses = useServerStatus(servers)
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <ServerRow
          key={server.id}
          server={server}
          status={statuses[server.id] ?? "checking"}
          isActive={server.id === activeId}
          onSetActive={() => setActive(server.id)}
          onUpdate={(patch) => update(server.id, patch)}
          onRemove={() => remove(server.id)}
        />
      ))}
      {servers.length === 0 && !showAdd && (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground/40">
          <IconCloud size={28} />
          <span className="text-[13px]">No servers configured</span>
        </div>
      )}
      {showAdd ? (
        <AddServerInline onDone={() => setShowAdd(false)} />
      ) : (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <IconPlus size={13} />
          Add server
        </Button>
      )}
    </div>
  )
}

interface ServerRowProps {
  server: HuxfluxServer
  status: "online" | "offline" | "checking"
  isActive: boolean
  onSetActive: () => void
  onUpdate: (patch: Partial<Pick<HuxfluxServer, "name" | "url" | "token">>) => void
  onRemove: () => void
}

function ServerRow({ server, status, isActive, onSetActive, onUpdate, onRemove }: ServerRowProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return <ServerRowEdit server={server} onDone={() => setEditing(false)} onUpdate={onUpdate} />
  }

  function handleRemove() {
    // window.confirm can be blocked in some WebKit/Tauri contexts, so just remove directly.
    onRemove()
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
      <SettingsStatusDot status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{server.name}</span>
          {isActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
              Active
            </span>
          )}
        </div>
        <div className="text-[12px] font-mono text-muted-foreground/60 truncate">{server.url}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!isActive && (
          <Button variant="ghost" size="sm" onClick={onSetActive} className="text-xs">
            Set active
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)}>
          <IconPencil size={13} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={handleRemove} className="text-red-400 hover:text-red-400">
          <IconTrash size={13} />
        </Button>
      </div>
    </div>
  )
}

interface ServerRowEditProps {
  server: HuxfluxServer
  onDone: () => void
  onUpdate: (patch: Partial<Pick<HuxfluxServer, "name" | "url" | "token">>) => void
}

function ServerRowEdit({ server, onDone, onUpdate }: ServerRowEditProps) {
  const [name, setName] = useState(server.name)
  const [url, setUrl] = useState(server.url)
  const [token, setToken] = useState(server.token ?? "")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const trimmedToken = token.trim()
    if (!trimmedToken || saving) return
    setSaveError(null)
    setSaving(true)
    try {
      const targetUrl = (url.trim() || server.url).replace(/\/$/, "")
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(`${targetUrl}/api/config`, {
          headers: { Authorization: `Bearer ${trimmedToken}` },
          signal: controller.signal,
        })
        if (res.status === 401 || res.status === 403) { setSaveError("Invalid auth token."); return }
        if (!res.ok) { setSaveError("Could not reach server."); return }
      } finally {
        clearTimeout(timer)
      }
      onUpdate({ name: name.trim() || server.name, url: targetUrl, token: trimmedToken })
      onDone()
    } catch {
      setSaveError("Connection timed out.")
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setName(server.name)
    setUrl(server.url)
    setToken(server.token ?? "")
    setSaveError(null)
    onDone()
  }

  return (
    <div className="p-4 rounded-lg border border-ring bg-card space-y-3">
      <LabeledInput label="Name" value={name} onChange={setName} autoFocus />
      <LabeledInput label="URL" value={url} onChange={setUrl} mono />
      <LabeledInput label="Auth Token" value={token} onChange={setToken} placeholder="Paste token from huxflux status" mono />
      {saveError && (
        <div className="flex items-center gap-1.5 text-[12px] text-red-400">
          <IconAlertCircle size={13} />
          {saveError}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!token.trim() || saving}>
          {saving ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
          {saving ? "Verifying…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

interface LabeledInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  autoFocus?: boolean
}

function LabeledInput({ label, value, onChange, placeholder, mono, autoFocus }: LabeledInputProps) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">{label}</label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors ${mono ? "font-mono" : ""}`}
      />
    </div>
  )
}

function AddServerInline({ onDone }: { onDone: () => void }) {
  const { add } = useServers()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleConnectionStringChange(value: string) {
    setError(null)
    const parsed = parseConnectionString(value)
    if (parsed?.token) {
      setUrl(parsed.url)
      setToken(parsed.token)
    } else {
      setUrl(value)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!url.trim() || !token.trim() || loading) return
    setError(null)
    setLoading(true)
    const normalizedUrl = url.trim().replace(/\/$/, "")
    const trimmedToken = token.trim()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      let authResult: "ok" | "unauthorized" | "unreachable" = "unreachable"
      try {
        const res = await fetch(`${normalizedUrl}/api/config`, {
          headers: { Authorization: `Bearer ${trimmedToken}` },
          signal: controller.signal,
        })
        authResult = res.status === 401 || res.status === 403 ? "unauthorized" : res.ok ? "ok" : "unreachable"
      } finally {
        clearTimeout(timer)
      }
      if (authResult === "unreachable") { setError("Could not reach server. Check the URL."); return }
      if (authResult === "unauthorized") { setError("Invalid auth token."); return }
      add({ name: name.trim() || "My Server", url: normalizedUrl, token: trimmedToken })
      onDone()
    } catch (err) {
      setError(err instanceof Error && err.name === "AbortError" ? "Connection timed out." : "Could not reach server.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-lg border border-ring bg-card space-y-3">
      <div className="text-sm font-medium text-foreground">Add server</div>
      <LabeledInput label="Name" value={name} onChange={setName} placeholder="My Machine" autoFocus />
      <div>
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Connection string or URL</label>
        <input
          value={url}
          onChange={(e) => handleConnectionStringChange(e.target.value)}
          placeholder="huxflux://100.64.0.5:4321?token=… or http://localhost:4321"
          className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
        />
        <p className="text-[11px] text-muted-foreground/50 mt-1">
          Paste the connection string from <code className="font-mono">huxflux status</code> to fill both fields automatically.
        </p>
      </div>
      <LabeledInput label="Auth Token" value={token} onChange={setToken} placeholder="Paste token from huxflux status" mono />
      {error && (
        <div className="flex items-center gap-1.5 text-[12px] text-red-400">
          <IconAlertCircle size={13} />
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!url.trim() || !token.trim() || loading}>
          {loading && <IconLoader2 size={13} className="animate-spin" />}
          {loading ? "Connecting…" : "Add server"}
        </Button>
      </div>
    </form>
  )
}
