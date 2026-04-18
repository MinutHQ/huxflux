import { useState, useEffect, useRef } from "react"
import {
  IconGitBranch,
  IconChevronDown,
  IconFolder,
  IconCode,
  IconTerminal,
  IconTerminal2,
  IconDatabase,
  IconClipboard,
  IconEye,
  IconGitPullRequest,
  IconLayoutSidebarRightCollapse,
  IconPlayerPlayFilled,
  IconCircleCheck,
  IconCircleX,
  IconCircleDashed,
  IconClock,
  IconAlertTriangle,
  IconArrowUpRight,
} from "@tabler/icons-react"
import { cn, Button, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { api, useRepos, getActiveServer } from "@huxflux/shared"
import type { Agent, PRStatus } from "@huxflux/shared"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { getFlag } from "@/lib/flags"
import { isTauri } from "@/lib/platform"

const OPEN_IN_APPS = [
  { key: "finder",   label: "Finder",   Icon: IconFolder,    shortcut: "1" },
  { key: "vscode",   label: "VS Code",  Icon: IconCode,      shortcut: "2" },
  { key: "cursor",   label: "Cursor",   Icon: IconCode,      shortcut: "3" },
  { key: "iterm",    label: "iTerm",    Icon: IconTerminal,  shortcut: "4" },
  { key: "terminal", label: "Terminal", Icon: IconTerminal2, shortcut: "5" },
  { key: "datagrip", label: "DataGrip", Icon: IconDatabase,  shortcut: "6" },
] as const

const OPEN_IN_KEY = "huxflux:open-in-last"
const SSH_CAPABLE_EDITORS = ["vscode", "cursor"]

function isRemoteServer(): boolean {
  const server = getActiveServer()
  if (!server) return false
  try {
    const h = new URL(server.url).hostname
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1"
  } catch { return false }
}

// ── PR Status Badges ─────────────────────────────────────────────────────────

function PRBadges({ prStatus, agentId }: { prStatus: PRStatus; agentId: string }) {
  const [ciOpen, setCiOpen] = useState(false)

  const { data: prDetails } = useQuery({
    queryKey: ["pr-details", agentId],
    queryFn: () => api.getPRDetails(agentId),
    staleTime: 30_000,
  })

  const reviewState = prStatus.hasChangeRequests
    ? { label: "Changes requested", cls: "text-orange-400 bg-orange-400/10 border-orange-400/30", icon: IconCircleX }
    : prStatus.mergeableState === "clean"
    ? { label: "Approved", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", icon: IconCircleCheck }
    : prStatus.mergeableState === "blocked"
    ? { label: "Review required", cls: "text-amber-400 bg-amber-400/10 border-amber-400/30", icon: IconAlertTriangle }
    : prStatus.draft
    ? { label: "Draft", cls: "text-muted-foreground bg-muted/50 border-border", icon: IconCircleDashed }
    : { label: "Pending", cls: "text-muted-foreground bg-muted/50 border-border", icon: IconClock }

  // CI status from pr details
  const checks = prDetails?.checks ?? []
  const successCount = checks.filter(c => c.conclusion === "success").length
  const failedCount = checks.filter(c => c.conclusion === "failure").length
  const pendingCount = checks.filter(c => c.status !== "completed").length
  const ciState = failedCount > 0
    ? { icon: IconCircleX, cls: "text-red-400 bg-red-400/10 border-red-400/30", label: `${failedCount} failed` }
    : pendingCount > 0
    ? { icon: IconClock, cls: "text-amber-400 bg-amber-400/10 border-amber-400/30", label: `${pendingCount} pending` }
    : checks.length > 0
    ? { icon: IconCircleCheck, cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", label: `${successCount} passed` }
    : null

  return (
    <div className="flex items-center gap-1.5">
      {/* Review state */}
      <span className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", reviewState.cls)}>
        <reviewState.icon size={10} />
        {reviewState.label}
      </span>

      {/* CI badge with popover */}
      {ciState && (
        <Popover open={ciOpen} onOpenChange={setCiOpen}>
          <PopoverTrigger asChild>
            <button className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer", ciState.cls)}>
              <ciState.icon size={10} />
              CI
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2" sideOffset={4}>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Checks</div>
            <div className="space-y-1">
              {checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2">
                  {check.status !== "completed" ? (
                    <IconClock size={12} className="text-amber-400 shrink-0" />
                  ) : check.conclusion === "success" ? (
                    <IconCircleCheck size={12} className="text-emerald-400 shrink-0" />
                  ) : check.conclusion === "failure" ? (
                    <IconCircleX size={12} className="text-red-400 shrink-0" />
                  ) : (
                    <IconCircleDashed size={12} className="text-zinc-400 shrink-0" />
                  )}
                  <span className="text-[11px] text-foreground flex-1 truncate">{check.name}</span>
                  {check.url && (
                    <a href={check.url} target="_blank" rel="noreferrer" className="text-muted-foreground/40 hover:text-muted-foreground shrink-0">
                      <IconArrowUpRight size={10} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* PR number link */}
      <a
        href={prStatus.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/50 border border-border transition-colors"
      >
        <IconGitPullRequest size={10} />
        #{prStatus.number}
      </a>
    </div>
  )
}

// ── Main Header ──────────────────────────────────────────────────────────────

interface AgentWorkspaceHeaderProps {
  agent: Agent
  isStreaming: boolean
  githubEnabled: boolean
  onCreatePR?: () => void
  onReview?: () => void
  onRun?: () => void
  rightPanelVisible?: boolean
  onToggleRightPanel?: () => void
}

export function AgentWorkspaceHeader({ agent, isStreaming, githubEnabled, onCreatePR, onReview, onRun, rightPanelVisible = true, onToggleRightPanel }: AgentWorkspaceHeaderProps) {
  const queryClient = useQueryClient()
  const { data: repos = [] } = useRepos()
  const repo = repos.find((r) => r.id === agent.repoId)
  const repoName = repo?.name

  // Branch pickers
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState("")
  const branchSearchRef = useRef<HTMLInputElement>(null)
  const [baseBranchOpen, setBaseBranchOpen] = useState(false)
  const [baseBranchSearch, setBaseBranchSearch] = useState("")
  const baseBranchSearchRef = useRef<HTMLInputElement>(null)

  const { data: repoBranches = [] } = useQuery({
    queryKey: ["repo-branches", agent.repoId],
    queryFn: () => api.getRepoBranches(agent.repoId!),
    enabled: !!agent.repoId && (baseBranchOpen || branchPickerOpen),
    staleTime: 60_000,
  })

  // Open in
  const [lastOpenInApp, setLastOpenInApp] = useState(() => localStorage.getItem(OPEN_IN_KEY) ?? "vscode")
  const [openInOpen, setOpenInOpen] = useState(false)
  const remoteMode = getFlag("remoteEditor") && isTauri && isRemoteServer()
  const [detectedEditors, setDetectedEditors] = useState<string[]>([])
  const [sshInfo, setSshInfo] = useState<{ host: string; port: number; user: string; configured: boolean } | null>(null)

  useEffect(() => {
    if (!remoteMode) return
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string[]>("detect_editors").then(setDetectedEditors).catch(() => {})
    })
    api.getSystemSshInfo().then(setSshInfo).catch(() => {})
  }, [remoteMode])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "o" && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        void doOpenIn(lastOpenInApp)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [agent.id, lastOpenInApp, remoteMode, sshInfo])

  async function doOpenIn(appKey: string) {
    if (remoteMode && sshInfo) {
      try {
        const res = await api.getWorktreePath(agent.id)
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_ssh_editor", {
          editor: appKey,
          user: sshInfo.user,
          host: sshInfo.host,
          port: sshInfo.port,
          path: res.path,
        })
      } catch (err) {
        toast.error(String(err))
      }
    } else {
      void api.openIn(agent.id, appKey)
    }
  }

  function handleOpenIn(appKey: string) {
    localStorage.setItem(OPEN_IN_KEY, appKey)
    setLastOpenInApp(appKey)
    void doOpenIn(appKey)
  }

  async function selectBaseBranch(val: string) {
    setBaseBranchOpen(false)
    setBaseBranchSearch("")
    if (!val || val === agent.baseBranch) return
    await api.updateAgent(agent.id, { baseBranch: val })
    queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, baseBranch: val } : old)
  }

  async function selectBranch(val: string, force = false) {
    setBranchPickerOpen(false)
    setBranchSearch("")
    if (!val || val === agent.branch) return
    try {
      const updated = await api.switchBranch(agent.id, val, force || undefined)
      queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, ...updated } : old)
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch (err: any) {
      if (err?.message?.includes("already checked out")) {
        toast.error(`Branch "${val}" is locked to a stale worktree`, {
          action: { label: "Force remove & retry", onClick: () => void selectBranch(val, true) },
          duration: 8000,
        })
      } else {
        toast.error(err?.message ?? "Failed to switch branch")
      }
    }
  }

  const LastIcon = OPEN_IN_APPS.find((a) => a.key === lastOpenInApp)?.Icon ?? IconCode

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
      {/* Left: agent identity + branches */}
      <div className="flex flex-col gap-0.5 min-w-0">
        {/* Repo / Agent name */}
        <div className="flex items-center gap-1 text-[13px] font-medium text-foreground truncate">
          {repoName && (
            <>
              <span className="text-muted-foreground/50">{repoName}</span>
              <span className="text-muted-foreground/30">/</span>
            </>
          )}
          <span className="truncate">{agent.title}</span>
        </div>

        {/* Branch info */}
        <div className="flex items-center gap-1.5">
          <IconGitBranch size={11} className="text-muted-foreground/40 shrink-0" />
          <Popover open={branchPickerOpen} onOpenChange={(o) => { setBranchPickerOpen(o); if (o) setBranchSearch("") }}>
            <PopoverTrigger asChild>
              <button className="text-[11px] text-muted-foreground/60 font-mono hover:text-foreground transition-colors flex items-center gap-0.5 truncate max-w-[180px]">
                {agent.branch}
                <IconChevronDown size={9} className="opacity-50 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1" align="start">
              <input
                ref={branchSearchRef}
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBranchPickerOpen(false)
                  if (e.key === "Enter") {
                    const filtered = repoBranches.filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()))
                    if (filtered.length === 1) void selectBranch(filtered[0])
                    else if (branchSearch.trim()) void selectBranch(branchSearch.trim())
                  }
                }}
                placeholder="Search branches..."
                autoFocus
                className="w-full bg-transparent border-b border-border px-2 py-1.5 text-[12px] font-mono outline-none placeholder:text-muted-foreground/50 mb-1"
              />
              <div className="max-h-48 overflow-y-auto">
                {repoBranches
                  .filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()))
                  .map((b) => (
                    <button
                      key={b}
                      onClick={() => void selectBranch(b)}
                      className={cn(
                        "w-full text-left px-2 py-1 text-[12px] font-mono rounded hover:bg-accent transition-colors",
                        b === agent.branch && "text-foreground font-medium"
                      )}
                    >
                      {b}
                    </button>
                  ))}
                {repoBranches.length === 0 && (
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Loading branches...</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground/20 shrink-0">›</span>
          <Popover open={baseBranchOpen} onOpenChange={(o) => { setBaseBranchOpen(o); if (o) setBaseBranchSearch("") }}>
            <PopoverTrigger asChild>
              <button className="text-[11px] text-muted-foreground/40 font-mono hover:text-foreground transition-colors flex items-center gap-0.5">
                {agent.baseBranch ?? "origin/main"}
                <IconChevronDown size={9} className="opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              <input
                ref={baseBranchSearchRef}
                value={baseBranchSearch}
                onChange={(e) => setBaseBranchSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBaseBranchOpen(false)
                  if (e.key === "Enter") {
                    const filtered = repoBranches.filter((b) => b.toLowerCase().includes(baseBranchSearch.toLowerCase()))
                    if (filtered.length === 1) void selectBaseBranch(filtered[0])
                    else if (baseBranchSearch.trim()) void selectBaseBranch(baseBranchSearch.trim())
                  }
                }}
                placeholder="Search branches..."
                autoFocus
                className="w-full bg-transparent border-b border-border px-2 py-1.5 text-[12px] font-mono outline-none placeholder:text-muted-foreground/50 mb-1"
              />
              <div className="max-h-48 overflow-y-auto">
                {repoBranches
                  .filter((b) => b.toLowerCase().includes(baseBranchSearch.toLowerCase()))
                  .map((branch) => (
                    <button
                      key={branch}
                      onClick={() => void selectBaseBranch(branch)}
                      className={cn(
                        "w-full text-left px-2 py-1 text-[12px] font-mono rounded hover:bg-accent transition-colors",
                        branch === (agent.baseBranch ?? "origin/main") && "text-foreground font-medium"
                      )}
                    >
                      {branch}
                    </button>
                  ))}
                {repoBranches.length === 0 && (
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Loading branches...</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Right side: PR status + actions */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {/* PR badges */}
        {githubEnabled && agent.prStatus && (
          <PRBadges prStatus={agent.prStatus} agentId={agent.id} />
        )}

        {githubEnabled && agent.prStatus && (
          <div className="w-px h-4 bg-border" />
        )}

        {githubEnabled && !agent.prStatus && !isStreaming && agent.messages.length > 0 && onCreatePR && (
          <Button variant="ghost" size="xs" onClick={onCreatePR}>
            <IconGitPullRequest size={12} />
            Create PR
          </Button>
        )}
        {!isStreaming && agent.messages.length > 0 && onReview && (
          <Button variant="ghost" size="xs" onClick={onReview}>
            <IconEye size={12} />
            Review
          </Button>
        )}

        {/* Run button */}
        {repo?.runScript && onRun && (
          <Button variant="ghost" size="xs" onClick={onRun}>
            <IconPlayerPlayFilled size={11} />
            Run
          </Button>
        )}

        {/* Open in editor: icon button + dropdown */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => handleOpenIn(lastOpenInApp)}
            className="flex items-center px-1.5 py-1 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title={`Open in ${OPEN_IN_APPS.find((a) => a.key === lastOpenInApp)?.label ?? "editor"} (⌘O)`}
          >
            <LastIcon size={13} />
          </button>
          <Popover open={openInOpen} onOpenChange={setOpenInOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center px-1 py-1 border-l border-border hover:bg-accent transition-colors text-muted-foreground/50 hover:text-muted-foreground">
                <IconChevronDown size={9} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1" sideOffset={4}>
              {remoteMode && sshInfo && !sshInfo.configured && (
                <div className="flex items-center justify-between px-2 py-1.5 mb-1 text-[11px] text-amber-400 bg-amber-400/10 rounded">
                  <span>SSH not configured</span>
                </div>
              )}
              {(remoteMode
                ? OPEN_IN_APPS.filter((a) => SSH_CAPABLE_EDITORS.includes(a.key) && detectedEditors.includes(a.key))
                : OPEN_IN_APPS
              ).map((item) => (
                <button
                  key={item.key}
                  onClick={() => { handleOpenIn(item.key); setOpenInOpen(false) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
                >
                  <item.Icon size={14} className="text-muted-foreground" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {!remoteMode && <span className="text-[10px] text-muted-foreground/40">{item.shortcut}</span>}
                </button>
              ))}
              {remoteMode && detectedEditors.length === 0 && (
                <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
                  No SSH-capable editors found.<br />Install VS Code or Cursor.
                </div>
              )}
              <div className="border-t border-border my-1" />
              <button
                onClick={async () => {
                  setOpenInOpen(false)
                  const res = await api.getWorktreePath(agent.id)
                  await navigator.clipboard.writeText(res.path)
                  toast.success("Path copied")
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded hover:bg-accent transition-colors"
              >
                <IconClipboard size={14} className="text-muted-foreground" />
                <span className="flex-1 text-left">Copy path</span>
                {!remoteMode && <span className="text-[10px] text-muted-foreground/40">⌘⇧C</span>}
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Toggle right panel */}
        {onToggleRightPanel && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleRightPanel}
            title={rightPanelVisible ? "Hide panel (⌘U)" : "Show panel (⌘U)"}
            className={cn(!rightPanelVisible && "text-muted-foreground/40")}
          >
            <IconLayoutSidebarRightCollapse size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
