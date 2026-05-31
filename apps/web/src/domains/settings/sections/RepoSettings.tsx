import { useEffect, useRef, useState } from "react"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "@huxflux/ui"
import { api, type Repo, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import { IconAlertTriangle } from "@tabler/icons-react"
import { IconPickerPopover } from "../components/IconPickerPopover"
import { getTablerIcon } from "../utils"

interface RepoSettingsProps {
  repo: Repo
  color: string
  onRemove: () => void
}

export function RepoSettings({ repo, color, onRemove }: RepoSettingsProps) {
  const [branch, setBranch] = useState(repo.branchFrom)
  const [branchPrefix, setBranchPrefix] = useState(repo.branchPrefix ?? "")
  const [remote, setRemote] = useState(repo.remote)
  const [previewUrl, setPreviewUrl] = useState(repo.previewUrl ?? "")
  const [setupScript, setSetupScript] = useState(repo.setupScript ?? "")
  const [runScript, setRunScript] = useState(repo.runScript ?? "")
  const [icon, setIcon] = useState(repo.icon ?? "")
  const [showSaved, setShowSaved] = useState(false)
  const isFirstRender = useRef(true)

  const updateRepo = useHuxfluxMutation<unknown, Parameters<typeof api.repos.update>[1]>({
    mutationFn: (patch) => api.repos.update(repo.id, patch),
    invalidate: () => queryKeys.repos.all,
    onSuccess: () => {
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    },
  })

  const deleteRepo = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.repos.delete(repo.id),
    invalidate: () => queryKeys.repos.all,
    onSuccess: () => onRemove(),
  })

  // Auto-save on any field change (debounced 800ms)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const t = setTimeout(() => {
      updateRepo.mutate({
        branchFrom: branch,
        branchPrefix: branchPrefix || undefined,
        remote,
        previewUrl,
        setupScript,
        runScript,
        icon: icon || undefined,
      })
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, branchPrefix, remote, previewUrl, setupScript, runScript, icon])

  function handleRemove() {
    if (!confirm(`Remove repository "${repo.name}"? This cannot be undone.`)) return
    deleteRepo.mutate()
  }
  const isRemoving = deleteRepo.isPending

  // Folder repos have no git branches, no remote, no worktrees. Hide every
  // git-specific field rather than letting the user configure values that will
  // never apply.
  const isFolder = repo.type === "folder"

  return (
    <div className="space-y-8">
      <RepoHeader name={repo.name} icon={icon} color={color} onIconChange={setIcon} />
      <RepoPaths path={repo.path} workspacesPath={repo.workspacesPath} isFolder={isFolder} />
      {!isFolder && (
        <>
          <RepoBranchRemote branch={branch} remote={remote} onBranchChange={setBranch} onRemoteChange={setRemote} />
          <RepoBranchPrefix value={branchPrefix} onChange={setBranchPrefix} />
        </>
      )}
      <RepoPreviewUrl value={previewUrl} onChange={setPreviewUrl} />
      <RepoScripts
        setupScript={setupScript}
        runScript={runScript}
        onSetupChange={setSetupScript}
        onRunChange={setRunScript}
      />
      <div className="pt-4 border-t border-border flex items-center justify-between">
        <Button variant="destructive" size="sm" onClick={handleRemove} disabled={isRemoving}>
          {isRemoving ? "Removing…" : "Remove repository"}
        </Button>
        <span className={cn("text-[12px] text-muted-foreground/60 transition-opacity duration-500", showSaved ? "opacity-100" : "opacity-0")}>
          Saved
        </span>
      </div>
    </div>
  )
}

function RepoHeader({ name, icon, color, onIconChange }: { name: string; icon: string; color: string; onIconChange: (v: string) => void }) {
  const [showIconPicker, setShowIconPicker] = useState(false)
  const iconBtnRef = useRef<HTMLButtonElement>(null)
  const RepoIconComp = icon ? getTablerIcon(icon) : undefined

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          ref={iconBtnRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setShowIconPicker((v) => !v)}
          title="Change icon"
          className={cn("w-9 h-9 rounded-lg border text-sm font-bold flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity cursor-pointer", color)}
        >
          {/* eslint-disable-next-line react-hooks/static-components -- dynamic icon component resolved by name from the tabler library */}
          {RepoIconComp ? <RepoIconComp size={16} /> : name[0].toUpperCase()}
        </button>
        <h1 className="text-2xl font-semibold text-foreground">{name}</h1>
      </div>
      {showIconPicker && (
        <IconPickerPopover
          selectedIcon={icon}
          onSelect={onIconChange}
          onClose={() => setShowIconPicker(false)}
          anchorRef={iconBtnRef}
        />
      )}
    </div>
  )
}

function RepoPaths({ path, workspacesPath, isFolder }: { path: string; workspacesPath: string; isFolder: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Root path</label>
        <code className="flex w-full text-[12px] font-mono bg-secondary border border-border rounded-md px-3 py-2 text-muted-foreground">
          {path}
        </code>
      </div>
      {!isFolder && (
        <div>
          <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Workspaces path</label>
          <code className="flex w-full text-[12px] font-mono bg-secondary border border-border rounded-md px-3 py-2 text-muted-foreground">
            {workspacesPath}
          </code>
          <div className="flex items-start gap-1.5 mt-1.5">
            <IconAlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-muted-foreground/60 leading-snug">
              Workspaces are git worktrees. Changing this path will not move existing workspaces.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function RepoBranchRemote({
  branch, remote, onBranchChange, onRemoteChange,
}: {
  branch: string; remote: string; onBranchChange: (v: string) => void; onRemoteChange: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Branch new workspaces from
        </label>
        <Select value={branch} onValueChange={onBranchChange}>
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
        <Select value={remote} onValueChange={onRemoteChange}>
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
  )
}

function RepoBranchPrefix({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Branch prefix</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="agent/"
        className="w-full text-[13px] font-mono bg-card border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
      <p className="text-[11px] text-muted-foreground/50 mt-1">Prepended to agent branch names. Defaults to <code className="font-mono">agent/</code>.</p>
    </div>
  )
}

function RepoPreviewUrl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Preview URL</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://localhost:3000"
        className="w-full text-[13px] font-mono bg-card border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
      />
    </div>
  )
}

function RepoScripts({
  setupScript, runScript, onSetupChange, onRunChange,
}: {
  setupScript: string; runScript: string
  onSetupChange: (v: string) => void
  onRunChange: (v: string) => void
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-4">Scripts</h2>
      <div className="space-y-4">
        <ScriptField label="Setup script" value={setupScript} onChange={onSetupChange} />
        <ScriptField label="Run script" value={runScript} onChange={onRunChange} />
      </div>
    </div>
  )
}

function ScriptField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full text-[13px] font-mono bg-card border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors resize-none"
      />
    </div>
  )
}

