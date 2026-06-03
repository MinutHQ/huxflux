import { useEffect, useRef, useState } from "react"
import { cn } from "@huxflux/ui"
import { IconHexagon, IconLoader2, IconSend } from "@tabler/icons-react"
import { SETUP_STEPS } from "../config"
import type { PendingAgentInfo, SetupStep } from "../chat.types"
import { useTypewriter } from "./creationViewHooks"

const SV_KEYFRAMES = `
  @keyframes sv-float { 0%, 100% { transform: translateY(0px) rotate(0deg) } 50% { transform: translateY(-8px) rotate(2deg) } }
  @keyframes sv-particle { 0% { transform: translateY(0) scale(1); opacity: var(--p-op) } 50% { transform: translateY(-24px) scale(1.4); opacity: calc(var(--p-op) * 2) } 100% { transform: translateY(0) scale(1); opacity: var(--p-op) } }
  @keyframes sv-fade-up { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes sv-check { from { stroke-dashoffset: 16 } to { stroke-dashoffset: 0 } }
  @keyframes sv-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes sv-progress { from { width: 0% } to { width: var(--sv-progress) } }
  @keyframes sv-glow { 0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.06), 0 0 60px rgba(251,191,36,0.03) } 50% { box-shadow: 0 0 30px rgba(251,191,36,0.15), 0 0 80px rgba(251,191,36,0.08) } }
  @keyframes sv-orbit { from { transform: rotate(0deg) translateX(36px) rotate(0deg) } to { transform: rotate(360deg) translateX(36px) rotate(-360deg) } }
  @keyframes sv-orbit2 { from { transform: rotate(120deg) translateX(28px) rotate(-120deg) } to { transform: rotate(480deg) translateX(28px) rotate(-480deg) } }
  @keyframes sv-hex-assemble { 0% { opacity: 0; transform: scale(0.3) rotate(-180deg) } 50% { opacity: 1; transform: scale(1.1) rotate(10deg) } 100% { opacity: 1; transform: scale(1) rotate(0deg) } }
  @keyframes sv-ring-expand { 0% { transform: scale(0.8); opacity: 0.5 } 100% { transform: scale(2.5); opacity: 0 } }
  @keyframes sv-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
  @keyframes sv-step-in { from { opacity: 0; transform: translateX(-8px) } to { opacity: 1; transform: translateX(0) } }
  @keyframes sv-dots { 0% { content: '' } 25% { content: '.' } 50% { content: '..' } 75% { content: '...' } }
  @keyframes sv-scanner { 0% { top: 0%; opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { top: 100%; opacity: 0 } }
`

const SETUP_PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  x: ((i * 41 + 17) % 100),
  y: ((i * 59 + 11) % 100),
  size: 1.5 + (i % 3),
  duration: 2.5 + (i % 4) * 1.1,
  delay: (i % 8) * 0.35,
  opacity: 0.1 + (i % 4) * 0.08,
}))

function useSetupStepProgress(estimatedMs: number) {
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)

  // Distribute steps across ~90% of the estimated duration so the last step
  // only spins briefly rather than hanging for a long time.
  useEffect(() => {
    const total = estimatedMs
    const budget = total * 0.9
    const stepTime = budget / SETUP_STEPS.length
    const timers: ReturnType<typeof setTimeout>[] = []
    SETUP_STEPS.forEach((_, i) => {
      const showAt = 300 + i * stepTime
      const doneAt = showAt + stepTime * 0.65
      timers.push(setTimeout(() => setVisibleSteps(i + 1), showAt))
      if (i < SETUP_STEPS.length - 1) {
        timers.push(setTimeout(() => setCompletedSteps(i + 1), doneAt))
      }
    })
    return () => timers.forEach(clearTimeout)
  }, [estimatedMs])

  return { visibleSteps, completedSteps }
}

function HexHero() {
  return (
    <div className="relative z-10" style={{ animation: "sv-float 3.5s ease-in-out infinite" }}>
      <div className="absolute inset-0 rounded-2xl border-2 border-amber-400/25" style={{ animation: "sv-ring-expand 2.5s ease-out infinite" }} />
      <div className="absolute inset-0 rounded-2xl border-2 border-blue-400/15" style={{ animation: "sv-ring-expand 2.5s ease-out 0.8s infinite" }} />
      <div className="absolute inset-0 rounded-2xl border-2 border-violet-400/10" style={{ animation: "sv-ring-expand 2.5s ease-out 1.6s infinite" }} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{ animation: "sv-orbit 4s linear infinite" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{ animation: "sv-orbit2 5s linear infinite" }}>
          <div className="w-1 h-1 rounded-full bg-blue-400/50" />
        </div>
      </div>
      <div className="w-16 h-16 rounded-2xl bg-card border border-amber-400/20 flex items-center justify-center relative overflow-hidden" style={{ animation: "sv-glow 2.5s ease-in-out infinite" }}>
        <div className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent pointer-events-none" style={{ animation: "sv-scanner 2s ease-in-out infinite" }} />
        <div style={{ animation: "sv-hex-assemble 0.8s ease-out both" }}>
          <IconHexagon size={32} className="text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
        </div>
      </div>
    </div>
  )
}

function StepRow({ step, isDone, isCurrent }: { step: SetupStep; isDone: boolean; isCurrent: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono" style={{ animation: "sv-step-in 0.3s ease-out both" }}>
      <span className="text-muted-foreground/40 shrink-0">{step.icon}</span>
      <span className={cn(
        "flex-1 transition-colors duration-300",
        isDone ? "text-muted-foreground/40" : isCurrent ? "text-amber-400/90" : "text-foreground/70"
      )}>
        {step.label}
      </span>
      {isDone ? (
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-emerald-400">
          <path d="M3 6.5L5 8.5L9 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" style={{ animation: "sv-check 0.3s ease-out both" }} />
        </svg>
      ) : isCurrent ? (
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-amber-400" style={{ animation: "sv-spin 1s linear infinite" }}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 15" strokeLinecap="round" />
        </svg>
      ) : null}
    </div>
  )
}

function StepTerminal({ repoName, visibleSteps, completedSteps, progress }: { repoName: string; visibleSteps: number; completedSteps: number; progress: number }) {
  return (
    <div className="w-full max-w-xs z-10 rounded-xl overflow-hidden border border-border/60 bg-card/80 backdrop-blur-sm" style={{ animation: "sv-fade-up 0.6s ease-out 0.5s both" }}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 bg-secondary/40">
        <div className="w-2 h-2 rounded-full bg-red-400/40" />
        <div className="w-2 h-2 rounded-full bg-yellow-400/40" />
        <div className="w-2 h-2 rounded-full bg-green-400/40" />
        <span className="text-[9px] text-muted-foreground/40 font-mono ml-1.5">{repoName}</span>
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        {SETUP_STEPS.slice(0, visibleSteps).map((step, i) => (
          <StepRow key={i} step={step} isDone={i < completedSteps} isCurrent={i === visibleSteps - 1 && !(i < completedSteps)} />
        ))}
      </div>
      <div className="px-3 pb-2.5">
        <div className="h-[3px] rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400/80 via-amber-400 to-yellow-300"
            style={{ ["--sv-progress" as string]: `${progress}%`, width: `${progress}%`, transition: "width 0.6s ease-out" }}
          />
        </div>
      </div>
    </div>
  )
}

interface SetupInputProps {
  queuedMessage?: string | null
  onQueueMessage: (msg: string) => void
  draft: string
  onDraftChange: (next: string) => void
}

function SetupInput({ queuedMessage, onQueueMessage, draft, onDraftChange }: SetupInputProps) {
  const setupTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync the textarea height with the (workspace-owned) draft so it auto-grows
  // both on keystrokes and when the route re-mounts with an existing draft.
  useEffect(() => {
    const el = setupTextareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 120) + "px"
  }, [draft])

  function submit() {
    const text = draft.trim()
    if (text) {
      onQueueMessage(text)
      onDraftChange("")
    }
  }

  return (
    <div className="w-full max-w-md z-10 mt-2" style={{ animation: "sv-fade-up 0.6s ease-out 0.8s both" }}>
      {queuedMessage ? (
        <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm px-4 py-3 text-[12px] text-muted-foreground/60 flex items-center gap-2">
          <IconLoader2 size={13} className="animate-spin text-amber-400/60 shrink-0" />
          <span className="truncate">Will send: <span className="text-foreground/70">{queuedMessage}</span></span>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden focus-within:border-amber-400/30 transition-colors">
          <textarea
            ref={setupTextareaRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Type your first message while the agent sets up..."
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/30 resize-none px-4 pt-3 pb-2 focus:outline-none"
            rows={1}
            autoFocus
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[10px] text-muted-foreground/30">Message will be sent once agent is ready</span>
            <button
              onClick={submit}
              disabled={!draft.trim()}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                draft.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground/30"
              )}
            >
              <IconSend size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SetupViewProps {
  pending: PendingAgentInfo
  onQueueMessage?: (msg: string) => void
  queuedMessage?: string | null
  draft?: string
  onDraftChange?: (next: string) => void
}

export function SetupView({ pending, onQueueMessage, queuedMessage, draft, onDraftChange }: SetupViewProps) {
  const typedTitle = useTypewriter(pending.title, 50)
  const { visibleSteps, completedSteps } = useSetupStepProgress(pending.estimatedMs)
  const progress = Math.min(((completedSteps + 0.5) / SETUP_STEPS.length) * 100, 95)

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-5 px-8 overflow-hidden bg-background">
      <style>{SV_KEYFRAMES}</style>

      {SETUP_PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.id % 3 === 0 ? "rgb(251,191,36)" : p.id % 3 === 1 ? "rgb(96,165,250)" : "rgb(167,139,250)",
            ["--p-op" as string]: p.opacity,
            opacity: p.opacity,
            animation: `sv-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}

      <HexHero />

      <div className="text-center z-10" style={{ animation: "sv-fade-up 0.6s ease-out 0.2s both" }}>
        <p
          className="text-sm font-semibold bg-clip-text text-transparent"
          style={{
            backgroundImage: "linear-gradient(90deg, var(--foreground) 0%, var(--foreground) 35%, rgba(251,191,36,0.9) 50%, var(--foreground) 65%, var(--foreground) 100%)",
            backgroundSize: "200% 100%",
            animation: "sv-shimmer 3s ease-in-out infinite",
            WebkitBackgroundClip: "text",
          }}
        >
          {typedTitle}
          <span className="inline-block w-[1px] h-[13px] bg-amber-400/70 ml-0.5 align-text-bottom animate-pulse" />
        </p>
        <p className="text-[11px] text-muted-foreground/50 mt-1 font-mono">{pending.branch}</p>
      </div>

      <StepTerminal repoName={pending.repoName} visibleSteps={visibleSteps} completedSteps={completedSteps} progress={progress} />

      {onQueueMessage && onDraftChange && (
        <SetupInput
          queuedMessage={queuedMessage}
          onQueueMessage={onQueueMessage}
          draft={draft ?? ""}
          onDraftChange={onDraftChange}
        />
      )}
    </div>
  )
}
