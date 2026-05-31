import React from "react"
import { cn, Button, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import {
  IconBrain,
  IconCheck,
  IconMap,
  IconPaperclip,
  IconPlayerStop,
  IconPlus,
  IconSend,
} from "@tabler/icons-react"
import { api } from "@huxflux/shared"
import { ContextRing } from "./ContextRing"
import { ModelSelect } from "./ModelSelect"
import { AgentSettingsPopover } from "./AgentSettingsPopover"
import { AgentLinker } from "./AgentLinker"
import type { ChatInputBarProps } from "./chatInputBarTypes"

function EffortSelect({ effort, setEffort, levels }: { effort: ChatInputBarProps["effort"]; setEffort: ChatInputBarProps["setEffort"]; levels: string[] }) {
  return (
    <Select value={effort || "default"} onValueChange={(v) => setEffort(v === "default" ? "" : v as typeof effort)}>
      <SelectTrigger className="h-auto border-0 shadow-none bg-transparent px-2 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground gap-1.5 focus:ring-0 [&>svg]:hidden">
        <IconBrain size={13} className={cn("shrink-0", effort ? "text-foreground" : "text-muted-foreground/60")} />
        <SelectValue>{effort ? `Effort: ${effort}` : "Effort"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Auto</SelectItem>
        {levels.map((lvl) => (
          <SelectItem key={lvl} value={lvl}>{lvl.charAt(0).toUpperCase() + lvl.slice(1)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PlusPopover(props: ChatInputBarProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground/60">
          <IconPlus size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-52 p-1">
        <button
          onClick={() => props.fileInputRef.current?.click()}
          className="flex items-center gap-3 w-full px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-md transition-colors"
        >
          <IconPaperclip size={15} className="text-muted-foreground shrink-0" />
          <span>Add attachment</span>
          <span className="ml-auto text-[11px] text-muted-foreground/50 font-mono">⌘U</span>
        </button>
        <AgentSettingsPopover agent={props.agent} />
        {!props.hideChrome && (
          <AgentLinker
            allAgents={props.allAgents}
            currentAgentId={props.agent.id}
            linkedAgents={props.linkedAgents}
            onToggle={props.onToggleLinkedAgent}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function PlanModeButton({ planMode, isInPlanMode, setPlanMode }: { planMode: boolean; isInPlanMode: boolean; setPlanMode: ChatInputBarProps["setPlanMode"] }) {
  return (
    <button
      onClick={() => setPlanMode(() => !planMode)}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-[12px]",
        isInPlanMode ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground/60"
      )}
    >
      <IconMap size={13} />
      <span>Plan</span>
    </button>
  )
}

function SendOrApprove(props: Pick<ChatInputBarProps, "showPlanApproval" | "onPlanApprove" | "onPlanDismiss" | "canSend" | "isStreaming" | "onSend">) {
  if (props.showPlanApproval) {
    return (
      <>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-muted-foreground" onClick={props.onPlanDismiss}>Dismiss</Button>
        <Button size="sm" className="h-6 text-[11px] px-2.5 gap-1" onClick={props.onPlanApprove}>
          <IconCheck size={12} />
          Approve
        </Button>
      </>
    )
  }
  return (
    <Button
      size="icon-xs"
      variant={props.canSend ? (props.isStreaming ? "outline" : "default") : "secondary"}
      disabled={!props.canSend}
      onClick={props.onSend}
      title={props.isStreaming ? "Queue message" : "Send"}
    >
      <IconSend size={13} />
    </Button>
  )
}

export function ChatInputActionRow(props: ChatInputBarProps) {
  const { agent, allModels, providers, capabilities, effort, setEffort, isStreaming, hideChrome, fileInputRef, onFileSelect, onModelChange, planMode, isInPlanMode, setPlanMode } = props
  const currentLabel = allModels.find((m) => m.id === agent.model)?.label ?? agent.model
  const effortLevels = (capabilities.effortLevels ?? []) as string[]

  return (
    <div className="flex items-center justify-between px-3 pb-3">
      <div className="flex items-center gap-1">
        <ModelSelect
          currentValue={`${agent.provider ?? "claude"}:${agent.model}`}
          currentLabel={currentLabel}
          models={allModels}
          providers={providers}
          onChange={onModelChange}
        />
        {effortLevels.length > 0 && <EffortSelect effort={effort} setEffort={setEffort} levels={effortLevels} />}
        {!hideChrome && capabilities.planMode !== false && (
          <PlanModeButton planMode={planMode} isInPlanMode={isInPlanMode} setPlanMode={setPlanMode} />
        )}
      </div>
      <div className="flex items-center gap-1">
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.md,.csv,.json" className="hidden" onChange={onFileSelect} />
        <ContextRing agentId={agent.id} isStreaming={isStreaming} />
        <PlusPopover {...props} />
        {isStreaming && (
          <Button size="icon-xs" variant="destructive" onClick={() => api.agents.stop(agent.id).catch(() => {})}>
            <IconPlayerStop size={13} />
          </Button>
        )}
        <SendOrApprove {...props} />
      </div>
    </div>
  )
}
