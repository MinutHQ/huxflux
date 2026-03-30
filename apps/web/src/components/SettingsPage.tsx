import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Switch } from "@/components/ui/switch"
import { SOUNDS, playSound } from "@/lib/sounds"
import { getSoundPref, setSoundPref, getSoundEnabled, setSoundEnabled } from "@/lib/notificationPrefs"
import type { SoundId } from "@/lib/sounds"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useRepos } from "@/hooks/useRepos"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { Repo } from "@/data/mock"
import {
  IconArrowLeft,
  IconSettings,
  IconBrain,
  IconPlug,
  IconPalette,
  IconGitBranch,
  IconUser,
  IconFlask,
  IconAdjustments,
  IconRefresh,
  IconVolume,
  IconSparkles,
  IconChevronDown,
  IconChevronRight,
  IconAlertTriangle,
  IconPlus,
  IconX,
  IconCloud,
  IconLoader2,
  IconAlertCircle,
  IconPencil,
  IconTrash,
  IconCheck,
  IconSearch,
  IconFolder,
} from "@tabler/icons-react"
import { useServers } from "@/hooks/useServers"
import { useServerStatus } from "@/hooks/useServerStatus"
import type { HiveServer } from "@/lib/serverStore"

type Section =
  | "general"
  | "models"
  | "providers"
  | "appearance"
  | "git"
  | "servers"
  | "account"
  | "experimental"
  | "advanced"
  | "updates"

const repoColors = [
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "bg-teal-500/20 text-teal-400 border-teal-500/30",
]

function repoColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % repoColors.length
  return repoColors[hash]
}

const navMain = [
  { id: "general" as Section, label: "General", icon: IconSettings },
  { id: "models" as Section, label: "Models", icon: IconBrain },
  { id: "providers" as Section, label: "Providers", icon: IconPlug },
  { id: "appearance" as Section, label: "Appearance", icon: IconPalette },
  { id: "git" as Section, label: "Git", icon: IconGitBranch },
  { id: "servers" as Section, label: "Servers", icon: IconCloud },
  { id: "account" as Section, label: "Account", icon: IconUser },
]

const navMore = [
  { id: "experimental" as Section, label: "Experimental", icon: IconFlask },
  { id: "advanced" as Section, label: "Advanced", icon: IconAdjustments },
  { id: "updates" as Section, label: "Check for updates", icon: IconRefresh },
]

// ── Setting row primitives ────────────────────────────────────────────────────

function SettingRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-5 border-b border-border last:border-0">
      {children}
    </div>
  )
}

function SettingInfo({ label, description }: { label: string; description?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium text-foreground">{label}</div>
      {description && <div className="text-[13px] text-muted-foreground mt-0.5 leading-snug">{description}</div>}
    </div>
  )
}

// ── Section content ───────────────────────────────────────────────────────────

function GeneralSettings() {
  const [notifications, setNotifications] = useState(true)
  const [soundEnabled, setSoundEnabledState] = useState(getSoundEnabled)
  const [autoConvert, setAutoConvert] = useState(true)
  const [stripYoureRight, setStripYoureRight] = useState(false)
  const [alwaysContext, setAlwaysContext] = useState(false)
  const [sendWith, setSendWith] = useState("enter")
  const [sound, setSoundState] = useState<SoundId>(getSoundPref)

  function handleSoundChange(id: SoundId) {
    setSoundState(id)
    setSoundPref(id)
  }

  function handleSoundEnabledChange(enabled: boolean) {
    setSoundEnabledState(enabled)
    setSoundEnabled(enabled)
  }

  return (
    <div>
      <SettingRow>
        <div>
          <SettingInfo label="Send messages with" description="Choose which key combination sends messages" />
          <div className="text-[12px] text-muted-foreground/60 mt-1">Use ⇧↵ for new lines</div>
        </div>
        <div className="shrink-0">
          <Select value={sendWith} onValueChange={setSendWith}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enter">Enter</SelectItem>
              <SelectItem value="cmd-enter">⌘ Enter</SelectItem>
              <SelectItem value="shift-enter">⇧ Enter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingRow>

      <SettingRow>
        <SettingInfo label="Desktop notifications" description="Get notified when AI finishes working in a chat." />
        <Switch checked={notifications} onCheckedChange={setNotifications} />
      </SettingRow>

      <SettingRow>
        <SettingInfo label="Sound effects" description="Play a sound when AI finishes working in a chat." />
        <div className="flex items-center gap-2 shrink-0">
          <Select value={sound} onValueChange={(v) => handleSoundChange(v as SoundId)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOUNDS.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => playSound(sound)}>
            <IconVolume size={13} />
            Test
          </Button>
          <Switch checked={soundEnabled} onCheckedChange={handleSoundEnabledChange} />
        </div>
      </SettingRow>

      <SettingRow>
        <SettingInfo
          label="Auto-convert long text"
          description="Convert pasted text over 5000 characters into text attachments"
        />
        <Switch checked={autoConvert} onCheckedChange={setAutoConvert} />
      </SettingRow>

      <SettingRow>
        <SettingInfo
          label="I'm not absolutely right, thank you very much"
          description={'Strip "You\'re absolutely right!" from AI messages'}
        />
        <Switch checked={stripYoureRight} onCheckedChange={setStripYoureRight} />
      </SettingRow>

      <SettingRow>
        <SettingInfo
          label="Always show context usage"
          description="Always how the context percent used in a chat (Claude only). By default, context usage is only shown when > 70% is used."
        />
        <Switch checked={alwaysContext} onCheckedChange={setAlwaysContext} />
      </SettingRow>
    </div>
  )
}

function ModelsSettings() {
  return (
    <div className="space-y-6">
      {[
        { name: "claude-opus-4-6", provider: "Anthropic", context: "200K", enabled: true },
        { name: "claude-sonnet-4-6", provider: "Anthropic", context: "200K", enabled: true },
        { name: "claude-haiku-4-5", provider: "Anthropic", context: "200K", enabled: true },
        { name: "gpt-4o", provider: "OpenAI", context: "128K", enabled: false },
        { name: "gpt-4o-mini", provider: "OpenAI", context: "128K", enabled: false },
      ].map((model) => (
        <div key={model.name} className="flex items-center justify-between py-4 border-b border-border last:border-0">
          <div>
            <div className="text-sm font-medium text-foreground font-mono">{model.name}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {model.provider} · {model.context} context
            </div>
          </div>
          <Switch defaultChecked={model.enabled} />
        </div>
      ))}
    </div>
  )
}

function ProvidersSettings() {
  return (
    <div className="space-y-4">
      {[
        { name: "Anthropic", key: "sk-ant-••••••••••••••••••••••••••ABCD", connected: true },
        { name: "OpenAI", key: "", connected: false },
      ].map((p) => (
        <div key={p.name} className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">{p.name}</span>
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full border", p.connected ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-secondary text-muted-foreground border-border")}>
              {p.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          {p.connected ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[12px] font-mono bg-secondary border border-border rounded px-3 py-1.5 text-muted-foreground truncate">
                {p.key}
              </code>
              <Button variant="outline" size="sm">Remove</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm">Add API key</Button>
          )}
        </div>
      ))}
    </div>
  )
}

function AppearanceSettings() {
  const [theme, setTheme] = useState("dark")
  const [fontSize, setFontSize] = useState("14")
  return (
    <div>
      <SettingRow>
        <SettingInfo label="Theme" description="Choose your preferred color scheme" />
        <Select value={theme} onValueChange={setTheme}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow>
        <SettingInfo label="Font size" description="Code and terminal font size" />
        <Select value={fontSize} onValueChange={setFontSize}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["12", "13", "14", "15", "16"].map(s => (
              <SelectItem key={s} value={s}>{s}px</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  )
}

function GitSettings() {
  const [autoPush, setAutoPush] = useState(false)
  const [signCommits, setSignCommits] = useState(true)
  return (
    <div>
      <SettingRow>
        <SettingInfo label="Auto-push after commit" description="Automatically push to remote after each commit" />
        <Switch checked={autoPush} onCheckedChange={setAutoPush} />
      </SettingRow>
      <SettingRow>
        <SettingInfo label="Sign commits" description="Sign commits with your GPG key" />
        <Switch checked={signCommits} onCheckedChange={setSignCommits} />
      </SettingRow>
      <SettingRow>
        <SettingInfo label="Default branch" description="Branch to use when creating new workspaces" />
        <Select defaultValue="develop">
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">main</SelectItem>
            <SelectItem value="develop">develop</SelectItem>
            <SelectItem value="master">master</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  )
}

function AccountSettings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-lg font-bold text-primary-foreground">
          A
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">alexmartosp</div>
          <div className="text-[13px] text-muted-foreground">alex@minut.com</div>
        </div>
        <Button variant="outline" size="sm" className="ml-auto">Sign out</Button>
      </div>
      <SettingRow>
        <SettingInfo label="Usage this month" description="API calls made across all agents" />
        <span className="text-sm font-mono text-foreground">2,847 calls</span>
      </SettingRow>
      <SettingRow>
        <SettingInfo label="Plan" description="Your current subscription" />
        <span className="text-[12px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">Pro</span>
      </SettingRow>
    </div>
  )
}

// ── Repo settings ─────────────────────────────────────────────────────────────

const preferenceItems = [
  {
    id: "code-review",
    title: "Code review preferences",
    description: "Instructions for how the agent should review code, what to focus on, and what to ignore.",
  },
  {
    id: "create-pr",
    title: "Create PR preferences",
    description: "Instructions for PR titles, descriptions, labels, reviewers, and branch naming conventions.",
  },
  {
    id: "fix-errors",
    title: "Fix errors preferences",
    description: "How the agent should approach fixing build errors, test failures, and linting issues.",
  },
  {
    id: "resolve-conflicts",
    title: "Resolve conflicts preferences",
    description: "Strategy for resolving merge conflicts — which branch to prefer, when to ask.",
  },
  {
    id: "branch-rename",
    title: "Branch rename preferences",
    description: "Naming conventions and patterns when creating or renaming branches.",
  },
  {
    id: "general",
    title: "General preferences",
    description: "General instructions that apply to all tasks for this repository.",
  },
]

function RepoSettings({ repo, color, onRemove }: { repo: Repo; color: string; onRemove: () => void }) {
  const queryClient = useQueryClient()
  const [branch, setBranch] = useState(repo.branchFrom)
  const [remote, setRemote] = useState(repo.remote)
  const [previewUrl, setPreviewUrl] = useState(repo.previewUrl ?? "")
  const [setupScript, setSetupScript] = useState(repo.setupScript ?? "")
  const [runScript, setRunScript] = useState(repo.runScript ?? "")
  const [archiveScript, setArchiveScript] = useState(repo.archiveScript ?? "")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [openPref, setOpenPref] = useState<string | null>(null)
  const [prefValues, setPrefValues] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      await api.updateRepo(repo.id, { branchFrom: branch, remote, previewUrl, setupScript, runScript, archiveScript })
      queryClient.invalidateQueries({ queryKey: ["repos"] })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove repository "${repo.name}"? This cannot be undone.`)) return
    setIsRemoving(true)
    try {
      await api.deleteRepo(repo.id)
      queryClient.invalidateQueries({ queryKey: ["repos"] })
      onRemove()
    } finally {
      setIsRemoving(false)
    }
  }

  const repoName = repo.name

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className={cn("w-9 h-9 rounded-lg border text-sm font-bold flex items-center justify-center shrink-0", color)}>
          {repoName[0].toUpperCase()}
        </span>
        <h1 className="text-2xl font-semibold text-foreground">{repoName}</h1>
      </div>

      {/* Paths */}
      <div className="space-y-3">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Root path</label>
          <code className="flex w-full text-[12px] font-mono bg-secondary border border-border rounded-md px-3 py-2 text-muted-foreground">
            {repo.path}
          </code>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Workspaces path</label>
          <code className="flex w-full text-[12px] font-mono bg-secondary border border-border rounded-md px-3 py-2 text-muted-foreground">
            {repo.workspacesPath}
          </code>
          <div className="flex items-start gap-1.5 mt-1.5">
            <IconAlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-muted-foreground/60 leading-snug">
              Workspaces are git worktrees. Changing this path will not move existing workspaces.
            </span>
          </div>
        </div>
      </div>

      {/* Branch + Remote */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Branch new workspaces from
          </label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="origin/develop">origin/develop</SelectItem>
              <SelectItem value="origin/main">origin/main</SelectItem>
              <SelectItem value="origin/master">origin/master</SelectItem>
              <SelectItem value="origin/staging">origin/staging</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Remote origin
          </label>
          <Select value={remote} onValueChange={setRemote}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="origin">origin</SelectItem>
              <SelectItem value="upstream">upstream</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview URL */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Preview URL</label>
        <input
          type="text"
          value={previewUrl}
          onChange={(e) => setPreviewUrl(e.target.value)}
          placeholder="https://localhost:$CONDUCTOR_PORT"
          className="w-full text-[13px] font-mono bg-card border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
        />
      </div>

      {/* Scripts */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Scripts</h2>
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Setup script</label>
            <textarea
              value={setupScript}
              onChange={(e) => setSetupScript(e.target.value)}
              rows={3}
              className="w-full text-[13px] font-mono bg-card border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-ring transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Run script</label>
            <textarea
              value={runScript}
              onChange={(e) => setRunScript(e.target.value)}
              rows={3}
              className="w-full text-[13px] font-mono bg-card border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-ring transition-colors resize-none"
            />
          </div>

          {/* Advanced accordion */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-accent/30 transition-colors"
            >
              <span className="font-medium">Advanced</span>
              <IconChevronDown size={14} className={cn("text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
            </button>
            {advancedOpen && (
              <div className="px-4 pb-4 border-t border-border">
                <div className="mt-4">
                  <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Archive script</label>
                  <textarea
                    value={archiveScript}
                    onChange={(e) => setArchiveScript(e.target.value)}
                    rows={3}
                    placeholder="e.g., rm -rf node_modules"
                    className="w-full text-[13px] font-mono bg-card border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          <p className="text-[12px] text-muted-foreground/60">
            Want to share scripts with your team?{" "}
            <span className="text-foreground/70 underline underline-offset-2 cursor-pointer hover:text-foreground transition-colors">
              Create a conductor.json file
            </span>
          </p>
        </div>
      </div>

      {/* Preferences */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Preferences</h2>
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {preferenceItems.map((pref) => {
            const isOpen = openPref === pref.id
            return (
              <div key={pref.id}>
                <button
                  onClick={() => setOpenPref(isOpen ? null : pref.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-accent/30 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">{pref.title}</div>
                    {!isOpen && (
                      <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{pref.description}</div>
                    )}
                  </div>
                  <IconChevronRight
                    size={14}
                    className={cn("text-muted-foreground/50 shrink-0 ml-4 transition-transform", isOpen && "rotate-90")}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 bg-accent/10">
                    <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">{pref.description}</p>
                    <textarea
                      value={prefValues[pref.id] ?? ""}
                      onChange={(e) => setPrefValues({ ...prefValues, [pref.id]: e.target.value })}
                      rows={4}
                      placeholder="Add instructions for this preference..."
                      className="w-full text-[13px] bg-card border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors resize-none"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Save + Remove */}
      <div className="pt-4 border-t border-border flex items-center justify-between">
        <Button variant="destructive" size="sm" onClick={handleRemove} disabled={isRemoving}>
          {isRemoving ? "Removing…" : "Remove repository"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

// ── Server status dot ─────────────────────────────────────────────────────────

function SettingsStatusDot({ status }: { status: "online" | "offline" | "checking" }) {
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

// ── Inline server edit row ────────────────────────────────────────────────────

function ServerRow({
  server,
  status,
  isActive,
  onSetActive,
  onUpdate,
  onRemove,
}: {
  server: HiveServer
  status: "online" | "offline" | "checking"
  isActive: boolean
  onSetActive: () => void
  onUpdate: (patch: Partial<Pick<HiveServer, "name" | "url">>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(server.name)
  const [url, setUrl] = useState(server.url)

  function handleSave() {
    onUpdate({ name: name.trim() || server.name, url: url.trim() || server.url })
    setEditing(false)
  }

  function handleRemove() {
    if (window.confirm(`Remove server "${server.name}"?`)) onRemove()
  }

  if (editing) {
    return (
      <div className="p-4 rounded-lg border border-ring bg-card space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setName(server.name); setUrl(server.url); setEditing(false) }}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>
            <IconCheck size={13} />
            Save
          </Button>
        </div>
      </div>
    )
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

// ── Add server inline form ────────────────────────────────────────────────────

function AddServerInline({ onDone }: { onDone: () => void }) {
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
      if (!ok) { setError("Server returned an error."); return }
      add({ name: name.trim() || "My Server", url: normalizedUrl })
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
      <div>
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Machine"
          className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">URL</label>
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null) }}
          placeholder="http://localhost:3001"
          className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
        />
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-[12px] text-red-400">
          <IconAlertCircle size={13} />
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!url.trim() || loading}>
          {loading && <IconLoader2 size={13} className="animate-spin" />}
          {loading ? "Connecting…" : "Add server"}
        </Button>
      </div>
    </form>
  )
}

// ── Servers settings ──────────────────────────────────────────────────────────

function ServersSettings() {
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

function PlaceholderSettings({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
      <IconSparkles size={32} className="opacity-30" />
      <p className="text-sm">{title} settings coming soon</p>
    </div>
  )
}

const sectionContent: Record<Section, React.ReactNode> = {
  general: <GeneralSettings />,
  models: <ModelsSettings />,
  providers: <ProvidersSettings />,
  appearance: <AppearanceSettings />,
  git: <GitSettings />,
  servers: <ServersSettings />,
  account: <AccountSettings />,
  experimental: <PlaceholderSettings title="Experimental" />,
  advanced: <PlaceholderSettings title="Advanced" />,
  updates: <PlaceholderSettings title="Updates" />,
}

const sectionTitles: Record<Section, string> = {
  general: "General",
  models: "Models",
  providers: "Providers",
  appearance: "Appearance",
  git: "Git",
  servers: "Servers",
  account: "Account",
  experimental: "Experimental",
  advanced: "Advanced",
  updates: "Check for updates",
}

// ── Add repo dialog ───────────────────────────────────────────────────────────

function AddRepoDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<{ name: string; path: string } | null>(null)
  const [manualPath, setManualPath] = useState("")
  const [manualName, setManualName] = useState("")
  const [useManual, setUseManual] = useState(false)
  const [branchFrom, setBranchFrom] = useState("origin/main")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load all repos on mount
  useEffect(() => {
    setLoading(true)
    api.findRepos().then((r) => { setResults(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Auto-fill name from path
  useEffect(() => {
    if (manualPath.trim() && !manualName) {
      const parts = manualPath.replace(/\/$/, "").split("/")
      setManualName(parts[parts.length - 1] ?? "")
    }
  }, [manualPath])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setSelected(null)
    setShowResults(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      api.findRepos(q).then((r) => { setResults(r); setLoading(false) }).catch(() => setLoading(false))
    }, 300)
  }

  function handleSelect(r: { name: string; path: string }) {
    setSelected(r)
    setQuery(r.name)
    setShowResults(false)
  }

  function handleSwitchToManual() {
    setUseManual(true)
    setSelected(null)
    setQuery("")
  }

  function handleSwitchToSearch() {
    setUseManual(false)
    setManualPath("")
    setManualName("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const repoPath = useManual ? manualPath.trim() : selected?.path
    const repoName = useManual ? (manualName.trim() || manualPath.trim().split("/").pop() || "repo") : selected?.name
    if (!repoPath || !repoName || isSubmitting) return
    setIsSubmitting(true)
    try {
      const repo = await api.createRepo({
        name: repoName,
        path: repoPath,
        workspacesPath: `${repoPath.replace(/\/$/, "")}/../.hive/workspaces/${repoName}`,
        branchFrom,
        remote: "origin",
      })
      queryClient.invalidateQueries({ queryKey: ["repos"] })
      onAdded(repo.id)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = useManual ? !!manualPath.trim() : !!selected

  const filtered = query.trim()
    ? results.filter((r) =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.path.toLowerCase().includes(query.toLowerCase())
      )
    : results

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground">Add repository</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <IconX size={15} />
          </button>
        </div>

        <div className="space-y-4">
          {!useManual ? (
            /* ── Search mode ── */
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Repository</label>
                <button
                  type="button"
                  onClick={handleSwitchToManual}
                  className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Enter path manually
                </button>
              </div>
              <div className="relative">
                <div className="relative">
                  <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                  <input
                    ref={searchRef}
                    autoFocus
                    type="text"
                    value={query}
                    onChange={handleQueryChange}
                    onFocus={() => setShowResults(true)}
                    placeholder="Search for a git repository…"
                    className="w-full text-sm bg-background border border-input rounded-md pl-8 pr-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
                  />
                  {loading && (
                    <IconLoader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 animate-spin" />
                  )}
                </div>

                {showResults && filtered.length > 0 && !selected && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                    {filtered.slice(0, 20).map((r) => (
                      <button
                        key={r.path}
                        type="button"
                        onClick={() => handleSelect(r)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
                      >
                        <IconFolder size={13} className="text-muted-foreground/50 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm text-foreground font-medium truncate">{r.name}</div>
                          <div className="text-[11px] text-muted-foreground/60 font-mono truncate">{r.path}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {showResults && !loading && filtered.length === 0 && query.trim() && !selected && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl px-3 py-4 text-center">
                    <span className="text-[13px] text-muted-foreground">No repositories found</span>
                  </div>
                )}
              </div>

              {selected && (
                <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-md bg-secondary">
                  <IconFolder size={12} className="text-muted-foreground/50 shrink-0" />
                  <code className="text-[11px] font-mono text-muted-foreground truncate flex-1">{selected.path}</code>
                  <button
                    type="button"
                    onClick={() => { setSelected(null); setQuery(""); searchRef.current?.focus() }}
                    className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                  >
                    <IconX size={11} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Manual mode ── */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Manual path</label>
                <button
                  type="button"
                  onClick={handleSwitchToSearch}
                  className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Search instead
                </button>
              </div>
              <input
                autoFocus
                type="text"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="/home/user/projects/my-repo"
                className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
              />
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Name</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder={manualPath.trim().split("/").pop() || "my-repo"}
                  className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
                />
              </div>
            </div>
          )}

          {/* Branch from */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Branch from</label>
            <input
              type="text"
              value={branchFrom}
              onChange={(e) => setBranchFrom(e.target.value)}
              placeholder="origin/main"
              className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Adding…" : "Add repository"}
          </Button>
        </div>
      </form>
    </div>,
    document.body
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface SettingsPageProps {
  onBack: () => void
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [section, setSection] = useState<Section>("general")
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [showAddRepo, setShowAddRepo] = useState(false)
  const { data: repos = [] } = useRepos()

  function handleSectionClick(id: Section) {
    setSection(id)
    setSelectedRepoId(null)
  }

  const activeRepo = selectedRepoId ? repos.find((r) => r.id === selectedRepoId) : null

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Left nav */}
      <div className="w-56 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
        <div className="px-3 py-4 border-b border-sidebar-border shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-sidebar-accent w-full"
          >
            <IconArrowLeft size={15} />
            Back to app
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {navMain.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleSectionClick(id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  !selectedRepoId && section === id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          <div className="px-4 pt-4 pb-1">
            <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">More</span>
          </div>
          <div className="p-2 space-y-0.5">
            {navMore.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleSectionClick(id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  !selectedRepoId && section === id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          <div className="px-4 pt-4 pb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">Repositories</span>
            <button
              onClick={() => setShowAddRepo(true)}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <IconPlus size={13} />
            </button>
          </div>
          <div className="p-2 space-y-0.5">
            {repos.map((repo) => {
              const color = repoColor(repo.name)
              return (
                <button
                  key={repo.id}
                  onClick={() => setSelectedRepoId(repo.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors text-left",
                    selectedRepoId === repo.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <span className={cn("w-5 h-5 rounded-sm border text-[10px] font-bold flex items-center justify-center shrink-0", color)}>
                    {repo.name[0].toUpperCase()}
                  </span>
                  <span className="truncate">{repo.name}</span>
                </button>
              )
            })}
            {repos.length === 0 && (
              <button
                onClick={() => setShowAddRepo(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded-md"
              >
                <IconPlus size={13} />
                Add repository
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-10 py-10">
          {activeRepo ? (
            <RepoSettings
              repo={activeRepo}
              color={repoColor(activeRepo.name)}
              onRemove={() => setSelectedRepoId(null)}
            />
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground mb-8">
                {sectionTitles[section]}
              </h1>
              {sectionContent[section]}
            </>
          )}
        </div>
      </div>

      {showAddRepo && (
        <AddRepoDialog
          onClose={() => setShowAddRepo(false)}
          onAdded={(id) => { setShowAddRepo(false); setSelectedRepoId(id) }}
        />
      )}
    </div>
  )
}
