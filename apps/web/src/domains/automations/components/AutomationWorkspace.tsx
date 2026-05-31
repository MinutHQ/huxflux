import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { cn } from "@huxflux/ui"
import { Button } from "@huxflux/ui"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@huxflux/ui"
import { api, useAgent, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import type { Automation, AutomationStep } from "@huxflux/shared"
import { ChatView } from "@/domains/chat/ChatView"
import { useAppContext } from "@/hooks/useAppContext"
import { isTauri } from "@/lib/platform"
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconLoader2,
  IconBolt,
  IconRefresh,
} from "@tabler/icons-react"
import { MOCK_AUTOMATIONS_BY_ID } from "../mockData"
import { FlowGraph } from "./FlowGraph"
import { RunsList } from "./RunsList"
import { SettingsPanel } from "./SettingsPanel"
import { GuidedSetup } from "./GuidedSetup"
import { MockChat } from "./MockChat"

type WorkspaceTab = "flow" | "runs" | "settings"

export function AutomationWorkspace({ automationId }: { automationId: string }) {
  const { sidebarCollapsed } = useAppContext()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("flow")
  const [setupSteps, setSetupSteps] = useState<AutomationStep[]>([])
  const [setupDone, setSetupDone] = useState(false)

  const isMock = automationId in MOCK_AUTOMATIONS_BY_ID
  const [builderAgentId, setBuilderAgentId] = useState<string | null>(null)
  const { data: builderAgent, isStreaming, loadMore, hasMore, isLoadingMore } = useAgent(builderAgentId)

  const { data: apiAutomation } = useHuxfluxQuery({
    queryKey: queryKeys.automations.detail(automationId),
    queryFn: () => api.automations.get(automationId),
    enabled: !isMock,
    staleTime: 2_000,
    refetchInterval: isStreaming ? 3_000 : false,
  })
  const automation = isMock ? MOCK_AUTOMATIONS_BY_ID[automationId] : apiAutomation ?? null

  useEffect(() => {
    // Syncing external (server-fetched) builder agent id into local UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (automation?.builderAgentId && !builderAgentId) setBuilderAgentId(automation.builderAgentId)
  }, [automation?.builderAgentId, builderAgentId])

  const replyToBuilder = useHuxfluxMutation<{ agentId: string }, string>({
    mutationFn: (message) => api.automations.replyToBuilder(automationId, message),
    onSuccess: (result) => setBuilderAgentId(result.agentId),
  })

  const initBuilder = useCallback(async (message?: string) => {
    if (builderAgentId) return builderAgentId
    try {
      const result = await replyToBuilder.mutateAsync(message ?? "")
      return result.agentId
    } catch { return null }
  }, [builderAgentId, replyToBuilder])

  const updateAutomation = useHuxfluxMutation<Automation, Partial<{ name: string; description: string; status: string; schedule: string }>>({
    mutationFn: (updates) => api.automations.update(automationId, updates),
    invalidate: () => [queryKeys.automations.detail(automationId), queryKeys.automations.list()],
  })

  const runAutomation = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.automations.run(automationId),
    invalidate: () => queryKeys.automations.detail(automationId),
  })

  const deleteAutomation = useHuxfluxMutation<void, void>({
    mutationFn: () => api.automations.delete(automationId),
    invalidate: () => queryKeys.automations.list(),
    onSuccess: () => navigate({ to: "/automations" }),
  })

  const handleUpdate = (updates: Partial<{ name: string; description: string; status: string; schedule: string }>) => {
    updateAutomation.mutate(updates)
  }
  const handleRun = () => runAutomation.mutate()
  const handleDelete = () => deleteAutomation.mutate()
  const running = runAutomation.isPending

  if (!automation) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconLoader2 size={20} className="text-muted-foreground/40 animate-spin" />
      </div>
    )
  }

  const isActive = automation.status === "active"
  const flowSteps = (automation.steps?.length ?? 0) > 0 ? automation.steps! : setupSteps

  return (
    <div className="flex flex-col h-full w-full">
      <Header
        automation={automation}
        sidebarCollapsed={sidebarCollapsed}
        isActive={isActive}
        running={running}
        onBack={() => navigate({ to: "/automations" })}
        onToggle={() => handleUpdate({ status: isActive ? "paused" : "active" })}
        onRun={handleRun}
        onDelete={handleDelete}
      />

      <div className="flex-1 min-h-0 p-1 pt-0">
        <ResizablePanelGroup orientation="horizontal" className="h-full gap-1">
          <ResizablePanel defaultSize={50} minSize="30">
            <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden">
              <BuilderPane
                automation={automation}
                builderAgent={builderAgent}
                isStreaming={isStreaming}
                loadMore={loadMore}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                setupDone={setupDone}
                onSetupComplete={(config) => {
                  setSetupSteps(config.steps)
                  setSetupDone(true)
                  const triggerDesc =
                    config.trigger === "schedule" ? `Run every ${config.triggerConfig.interval}`
                    : config.trigger === "event" ? `Triggered by: ${config.triggerConfig.eventType}`
                    : "Manual trigger"
                  const msg = `Set up this automation:\n\nTrigger: ${triggerDesc}\n\nWhat it should do: ${config.description}`
                  initBuilder(msg).catch(() => {})
                }}
                onInitBuilder={initBuilder}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-0 bg-transparent" />

          <ResizablePanel defaultSize={50} minSize="25">
            <div className="h-full rounded-xl bg-card border border-border/40 overflow-hidden flex flex-col">
              <TabBar activeTab={activeTab} onSelectTab={setActiveTab} runCount={automation.runCount} />
              {activeTab === "flow" && <FlowGraph steps={flowSteps} />}
              {activeTab === "runs" && <RunsList runs={automation.runs ?? []} />}
              {activeTab === "settings" && <SettingsPanel key={automation.id} automation={automation} onUpdate={handleUpdate} />}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

interface HeaderProps {
  automation: Automation
  sidebarCollapsed: boolean
  isActive: boolean
  running: boolean
  onBack: () => void
  onToggle: () => void
  onRun: () => void
  onDelete: () => void
}

function Header({ automation, sidebarCollapsed, isActive, running, onBack, onToggle, onRun, onDelete }: HeaderProps) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-1.5 shrink-0", isTauri && "min-h-12", sidebarCollapsed && isTauri && "pl-32")}>
      <button onClick={onBack} className="text-muted-foreground/50 hover:text-foreground transition-colors">
        <IconArrowLeft size={14} />
      </button>
      <div className="flex items-center gap-2 min-w-0">
        <IconBolt size={14} className="text-muted-foreground/50 shrink-0" />
        <span className="text-[13px] font-medium text-foreground truncate">{automation.name}</span>
      </div>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="xs" onClick={onToggle}>
          {isActive ? <><IconPlayerPause size={12} /> Pause</> : <><IconPlayerPlay size={12} /> Activate</>}
        </Button>
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
        >
          {running ? <IconLoader2 size={12} className="animate-spin" /> : <IconRefresh size={12} />}
          Run now
        </button>
        <button onClick={onDelete} className="p-1 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-accent transition-colors">
          <IconTrash size={13} />
        </button>
      </div>
    </div>
  )
}

function TabBar({ activeTab, onSelectTab, runCount }: { activeTab: WorkspaceTab; onSelectTab: (tab: WorkspaceTab) => void; runCount: number }) {
  return (
    <div className="relative flex items-center shrink-0 px-2 pb-1.5 pt-1 gap-1">
      <div className="absolute inset-0 bg-gradient-to-b from-primary-foreground/[0.04] to-transparent pointer-events-none" />
      {(["flow", "runs", "settings"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => onSelectTab(tab)}
          className={cn(
            "px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors capitalize",
            activeTab === tab ? "bg-accent text-foreground" : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
          )}
        >
          {tab}
          {tab === "runs" && runCount > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/40">{runCount}</span>
          )}
        </button>
      ))}
    </div>
  )
}

interface BuilderPaneProps {
  automation: Automation
  builderAgent: Parameters<typeof ChatView>[0]["agent"] | undefined
  isStreaming: boolean
  loadMore: () => Promise<void>
  hasMore: boolean
  isLoadingMore: boolean
  setupDone: boolean
  onSetupComplete: (config: { trigger: string; triggerConfig: Record<string, string>; description: string; steps: AutomationStep[] }) => void
  onInitBuilder: (msg?: string) => Promise<string | null>
}

function BuilderPane({ automation, builderAgent, isStreaming, loadMore, hasMore, isLoadingMore, setupDone, onSetupComplete, onInitBuilder }: BuilderPaneProps) {
  if (builderAgent && (builderAgent.messages.length > 0 || isStreaming)) {
    return (
      <ChatView
        agent={builderAgent}
        isStreaming={isStreaming}
        loadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        openFileTab={null}
        onClearFileTab={() => {}}
        hideChrome
        hideHeader
      />
    )
  }

  if (!setupDone && (automation?.steps ?? []).length === 0) {
    return (
      <GuidedSetup
        onComplete={onSetupComplete}
        onInitChat={async (msg) => { await onInitBuilder(msg) }}
      />
    )
  }

  return <MockChat onInitBuilder={async (msg) => { await onInitBuilder(msg) }} />
}
