import { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconArrowUp, IconLoader2, IconSparkles } from "@tabler/icons-react"
import { TRIGGERS, EVENT_OPTIONS, INTERVAL_PRESETS } from "../constants"
import type { MockQuestion, SetupPhase } from "../automations.types"

interface TriggerStepProps {
  phase: SetupPhase
  selectedTrigger: string | null
  interval: string
  eventType: string
  onSelect: (id: string) => void
  onIntervalChange: (interval: string) => void
  onEventChange: (eventType: string) => void
  onConfirm: () => void
}

export function TriggerStep({ phase, selectedTrigger, interval, eventType, onSelect, onIntervalChange, onEventChange, onConfirm }: TriggerStepProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-muted-foreground">1</div>
        <h3 className="text-[12px] font-medium text-foreground">What should trigger this automation?</h3>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {TRIGGERS.map((trigger) => {
          const Icon = trigger.icon
          const isSelected = selectedTrigger === trigger.id
          return (
            <button
              key={trigger.id}
              onClick={() => onSelect(trigger.id)}
              disabled={phase !== "trigger" && !isSelected}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                isSelected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/40 hover:border-border hover:bg-accent/30",
                phase !== "trigger" && !isSelected && "opacity-30 cursor-not-allowed"
              )}
            >
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", trigger.bg)}>
                <Icon size={16} className={trigger.color} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-foreground">{trigger.label}</p>
                <p className="text-[10px] text-muted-foreground/60">{trigger.description}</p>
              </div>
            </button>
          )
        })}
      </div>

      {selectedTrigger === "schedule" && phase === "trigger" && (
        <ScheduleTriggerConfig interval={interval} onIntervalChange={onIntervalChange} onConfirm={onConfirm} />
      )}

      {selectedTrigger === "event" && phase === "trigger" && (
        <EventTriggerConfig eventType={eventType} onEventChange={onEventChange} onConfirm={onConfirm} />
      )}
    </div>
  )
}

function ScheduleTriggerConfig({ interval, onIntervalChange, onConfirm }: { interval: string; onIntervalChange: (v: string) => void; onConfirm: () => void }) {
  return (
    <div className="pl-7 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Run every</label>
      <div className="flex flex-wrap gap-1.5">
        {INTERVAL_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => onIntervalChange(preset)}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors",
              interval === preset ? "bg-primary/15 text-foreground border border-primary/30" : "bg-accent/40 text-muted-foreground/60 hover:text-foreground border border-transparent"
            )}
          >
            {preset}
          </button>
        ))}
      </div>
      <button onClick={onConfirm} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors mt-2">
        Continue
      </button>
    </div>
  )
}

function EventTriggerConfig({ eventType, onEventChange, onConfirm }: { eventType: string; onEventChange: (v: string) => void; onConfirm: () => void }) {
  return (
    <div className="pl-7 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <label className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">When</label>
      <div className="space-y-1">
        {EVENT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onEventChange(opt.value)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-left transition-colors",
              eventType === opt.value ? "bg-primary/15 text-foreground border border-primary/30" : "bg-accent/40 text-muted-foreground/60 hover:text-foreground border border-transparent"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button onClick={onConfirm} disabled={!eventType} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors mt-2", eventType ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground/40 cursor-not-allowed")}>
        Continue
      </button>
    </div>
  )
}

interface DescribeStepProps {
  phase: SetupPhase
  description: string
  onDescriptionChange: (v: string) => void
  onSubmit: () => void
}

export function DescribeStep({ phase, description, onDescriptionChange, onSubmit }: DescribeStepProps) {
  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-muted-foreground">2</div>
        <h3 className="text-[12px] font-medium text-foreground">What should happen?</h3>
      </div>
      <textarea
        value={description}
        onChange={(e) => {
          onDescriptionChange(e.target.value)
          e.target.style.height = "auto"
          e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"
        }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit() }}
        placeholder="Describe what this automation should do..."
        rows={3}
        disabled={phase !== "describe"}
        className="w-full bg-accent/20 border border-border/40 rounded-xl px-3 py-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/30 outline-none resize-none focus:border-ring/50 disabled:opacity-60 transition-all"
      />
      {phase === "describe" && (
        <button onClick={onSubmit} disabled={!description.trim()} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors", description.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground/40 cursor-not-allowed")}>
          <IconSparkles size={12} />
          Build automation
        </button>
      )}
    </div>
  )
}

export function BuildingProgress({ progress }: { progress: number }) {
  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <div className="flex items-center gap-2">
        <IconLoader2 size={14} className="text-primary animate-spin" />
        <span className="text-[12px] text-muted-foreground">AI is building your automation...</span>
      </div>
      <div className="h-1 bg-accent rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

interface QuestionStepProps {
  question: MockQuestion
  index: number
  total: number
  onAnswer: (answer: string) => void
}

export function QuestionStep({ question, index, total, onAnswer }: QuestionStepProps) {
  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-medium text-muted-foreground">3</div>
        <h3 className="text-[12px] font-medium text-foreground">A few questions</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{index + 1}/{total}</span>
      </div>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <IconSparkles size={14} className="text-primary shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground leading-relaxed">{question.question}</p>
        </div>
        {question.type === "text" ? (
          <TextAnswerInput onAnswer={onAnswer} />
        ) : (
          <div className="space-y-1">
            {question.options?.map((opt) => (
              <button
                key={opt}
                onClick={() => onAnswer(opt)}
                className="w-full text-left px-3 py-2 rounded-lg text-[11px] border border-border/40 hover:bg-accent/30 hover:border-border transition-colors"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TextAnswerInput({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const [value, setValue] = useState("")
  const submit = () => { if (value.trim()) onAnswer(value.trim()) }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit() }}
        placeholder="Type your answer..."
        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
      />
      <button
        onClick={submit}
        className="p-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors shrink-0"
      >
        <IconArrowUp size={14} />
      </button>
    </div>
  )
}
