import { useEffect, useState } from "react"
import { cn } from "@huxflux/ui"
import { IconHexagon } from "@tabler/icons-react"
import { TEARDOWN_STEPS } from "../config"
import type { DeletingAgentInfo, SetupStep } from "../chat.types"

const TD_KEYFRAMES = `
  @keyframes td-fade-up { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes td-check { from { stroke-dashoffset: 16 } to { stroke-dashoffset: 0 } }
  @keyframes td-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes td-scatter { 0% { transform: translate(0,0) scale(1); opacity: 0.6 } 100% { transform: translate(var(--td-dx), var(--td-dy)) scale(0); opacity: 0 } }
  @keyframes td-shrink { 0% { transform: scale(1); opacity: 1 } 100% { transform: scale(0.5); opacity: 0 } }
  @keyframes td-ring-collapse { 0% { transform: scale(1); opacity: 0.3 } 100% { transform: scale(0.3); opacity: 0 } }
`

function useTeardownProgress() {
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [shrink, setShrink] = useState(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    TEARDOWN_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleSteps(i + 1), 100 + i * 350))
      timers.push(setTimeout(() => setCompletedSteps(i + 1), 100 + i * 350 + 250))
    })
    timers.push(setTimeout(() => setShrink(true), 1200))
    return () => timers.forEach(clearTimeout)
  }, [])

  return { visibleSteps, completedSteps, shrink }
}

const TD_PARTICLES = Array.from({ length: 14 }, (_, i) => {
  // Golden-ratio-based scatter for even distribution
  const phi = 1.618033988749
  const theta = i * phi * Math.PI * 2
  const r = 0.25 + (i / 14) * 0.55
  return {
    id: i,
    x: 50 + Math.cos(theta) * r * 45,
    y: 50 + Math.sin(theta) * r * 40,
    size: 1.5 + (i % 4),
    delay: (i * 0.11) % 0.9,
  }
})

function TeardownStepRow({ step, isDone, isCurrent }: { step: SetupStep; isDone: boolean; isCurrent: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono" style={{ animation: "td-fade-up 0.15s ease-out both" }}>
      <span className="text-red-400/50 shrink-0">{step.icon}</span>
      <span className={cn(
        "flex-1 transition-colors duration-200",
        isDone ? "text-muted-foreground/30" : isCurrent ? "text-red-400/80" : "text-foreground/60"
      )}>
        {step.label}
      </span>
      {isDone ? (
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-muted-foreground/40">
          <path d="M3 6.5L5 8.5L9 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" style={{ animation: "td-check 0.2s ease-out both" }} />
        </svg>
      ) : isCurrent ? (
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-red-400/60" style={{ animation: "td-spin 0.8s linear infinite" }}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 15" strokeLinecap="round" />
        </svg>
      ) : null}
    </div>
  )
}

export function TeardownView({ deleting }: { deleting: DeletingAgentInfo }) {
  const { visibleSteps, completedSteps, shrink } = useTeardownProgress()

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-4 px-8 overflow-hidden bg-background">
      <style>{TD_KEYFRAMES}</style>

      {TD_PARTICLES.map((p) => {
        const angle = Math.atan2(p.y - 50, p.x - 50)
        const dist = 40 + (p.id % 5) * 12
        return (
          <div
            key={p.id}
            className="absolute rounded-full bg-red-400 pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              ["--td-dx" as string]: `${Math.cos(angle) * dist}px`,
              ["--td-dy" as string]: `${Math.sin(angle) * dist}px`,
              animation: `td-scatter 1.2s ease-out ${p.delay}s both`,
            }}
          />
        )
      })}

      <div className="relative z-10" style={shrink ? { animation: "td-shrink 0.4s ease-in both" } : undefined}>
        <div className="absolute inset-0 rounded-2xl border-2 border-red-400/20" style={{ animation: "td-ring-collapse 0.8s ease-in 0.3s both" }} />
        <div className="w-14 h-14 rounded-2xl bg-card border border-red-400/20 flex items-center justify-center">
          <IconHexagon size={28} className="text-red-400/70 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]" />
        </div>
      </div>

      <div
        className="text-center z-10"
        style={shrink ? { animation: "td-shrink 0.4s ease-in 0.05s both" } : { animation: "td-fade-up 0.3s ease-out both" }}
      >
        <p className="text-sm font-semibold text-muted-foreground/70">{deleting.title}</p>
        <p className="text-[11px] text-muted-foreground/40 mt-0.5 font-mono">{deleting.branch}</p>
      </div>

      <div
        className="w-full max-w-xs z-10 rounded-xl overflow-hidden border border-border/40 bg-card/60"
        style={shrink ? { animation: "td-shrink 0.4s ease-in 0.1s both" } : { animation: "td-fade-up 0.3s ease-out 0.1s both" }}
      >
        <div className="px-3 py-2 space-y-1">
          {TEARDOWN_STEPS.slice(0, visibleSteps).map((step, i) => (
            <TeardownStepRow key={i} step={step} isDone={i < completedSteps} isCurrent={i === visibleSteps - 1 && !(i < completedSteps)} />
          ))}
        </div>
      </div>
    </div>
  )
}
