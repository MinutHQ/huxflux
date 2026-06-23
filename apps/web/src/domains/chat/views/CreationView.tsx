import { useMemo, useRef } from "react"
import { IconGitBranch, IconHexagon } from "@tabler/icons-react"
import type { Agent } from "@huxflux/shared"
import {
  CV_KEYFRAMES,
  useBlinkingCursor,
  useFlyingSymbols,
  useMouseTracking,
  useParticleAnimation,
  useTypewriter,
  type Particle,
} from "./creationViewHooks"
import { accentHueFromSeed } from "./accentHue"

// h: hue offset, l: lightness %, a: alpha — derives a tone from the agent's accent hue.
const tone = (hue: number, h: number, l: number, a: number) => `hsl(${(hue + h) % 360} 90% ${l}% / ${a})`

function HexIconHero({ hue }: { hue: number }) {
  return (
    <div className="relative" style={{ animation: "cv-float 4s ease-in-out infinite" }}>
      <div className="absolute inset-0 rounded-2xl border-2" style={{ borderColor: tone(hue, 0, 60, 0.3), animation: "cv-pulse-ring 3s ease-out infinite" }} />
      <div className="absolute inset-0 rounded-2xl border-2" style={{ borderColor: tone(hue, 40, 60, 0.2), animation: "cv-pulse-ring 3s ease-out 1s infinite" }} />
      <div className="absolute inset-0 rounded-2xl border-2" style={{ borderColor: tone(hue, 80, 65, 0.1), animation: "cv-pulse-ring 3s ease-out 2s infinite" }} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{ animation: "cv-orbit 6s linear infinite" }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone(hue, 0, 62, 0.6) }} />
        </div>
      </div>
      <div className="w-14 h-14 rounded-2xl bg-card border flex items-center justify-center relative" style={{ borderColor: tone(hue, 0, 60, 0.2), animation: "cv-glow 3s ease-in-out infinite" }}>
        <div style={{ animation: "cv-hex-bob 4s ease-in-out infinite" }}>
          <IconHexagon size={28} style={{ color: tone(hue, 0, 60, 1), filter: `drop-shadow(0 0 8px ${tone(hue, 0, 60, 0.5)})` }} />
        </div>
      </div>
    </div>
  )
}

function AgentInfoCard({ agent, hue }: { agent: Agent; hue: number }) {
  return (
    <div
      className="w-full max-w-xs z-10 rounded-xl p-[1px]"
      style={{
        background: `linear-gradient(90deg, transparent, ${tone(hue, 0, 60, 0.3)}, transparent)`,
        backgroundSize: "200% 100%",
        animation: "cv-fade-in 0.8s ease-out 0.3s both, cv-border-travel 4s ease-in-out infinite",
      }}
    >
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2">
          <IconGitBranch size={12} style={{ color: tone(hue, 0, 60, 0.6) }} />
          <span className="text-[11px] text-muted-foreground/60 font-mono">{agent.location}</span>
        </div>
        <div className="px-4 py-3 space-y-2 text-[12px] text-muted-foreground/60">
          <div className="flex items-center justify-between">
            <span>Model</span>
            <span className="font-mono text-foreground/70">{agent.model}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Status</span>
            <span className="flex items-center gap-1.5" style={{ color: tone(hue, 0, 60, 1) }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone(hue, 0, 60, 1), animation: "cv-status-pulse 2s ease-in-out infinite" }} />
              Ready
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentTitle({ agent, hue }: { agent: Agent; hue: number }) {
  return (
    <div className="text-center">
      <p
        className="text-sm font-semibold bg-clip-text text-transparent"
        style={{
          backgroundImage: `linear-gradient(90deg, var(--foreground) 0%, var(--foreground) 40%, ${tone(hue, 0, 60, 0.9)} 50%, var(--foreground) 60%, var(--foreground) 100%)`,
          backgroundSize: "200% 100%",
          animation: "cv-shimmer 4s ease-in-out infinite",
          WebkitBackgroundClip: "text",
        }}
      >
        {agent.title}
      </p>
      <p className="text-[12px] text-muted-foreground/60 mt-0.5 font-mono">{agent.branch}</p>
    </div>
  )
}

export function CreationView({ agent }: { agent: Agent }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const particleRefs = useRef<(HTMLDivElement | null)[]>([])
  const typedText = useTypewriter("Send a message to get started")
  const showCursor = useBlinkingCursor()
  const hue = accentHueFromSeed(agent.branch)

  const particles: Particle[] = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    id: i,
    x: ((i * 37 + 13) % 100),
    y: ((i * 53 + 7) % 100),
    size: 2.5 + (i % 5) * 1.2,
    duration: 3 + (i % 7) * 0.9,
    delay: (i % 11) * 0.3,
    opacity: 0.1 + (i % 4) * 0.08,
    phase: (i * 2.39996) % (Math.PI * 2),
  })), [])

  const mouseRef = useMouseTracking(containerRef)
  useParticleAnimation(containerRef, particleRefs, mouseRef, particles)
  const flyingSymbols = useFlyingSymbols(containerRef)

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-center h-full gap-6 px-8 overflow-hidden"
      style={{ ["--cv-hue" as string]: hue }}
    >
      <style>{CV_KEYFRAMES}</style>

      {particles.map((p, i) => (
        <div
          key={p.id}
          ref={(el) => { particleRefs.current[i] = el }}
          className="absolute left-0 top-0 rounded-full pointer-events-none will-change-transform"
          style={{ width: p.size, height: p.size, opacity: p.opacity, backgroundColor: tone(hue, (p.id % 3) * 35, 65, 1), transition: "opacity 0.3s ease" }}
        />
      ))}

      {flyingSymbols.map((s) => (
        <div
          key={s.id}
          className="absolute pointer-events-none z-20"
          style={{
            left: s.x,
            top: s.y,
            fontSize: s.fontSize,
            color: tone(hue, 0, 62, 1),
            ["--fly-x" as string]: `${s.flyX}px`,
            ["--fly-y" as string]: `${s.flyY}px`,
            animation: "cv-symbol-fly 2s ease-out forwards",
          }}
        >
          {s.symbol}
        </div>
      ))}

      <div className="flex flex-col items-center gap-3 z-10" style={{ animation: "cv-fade-in 0.8s ease-out both" }}>
        <HexIconHero hue={hue} />
        <AgentTitle agent={agent} hue={hue} />
      </div>

      <AgentInfoCard agent={agent} hue={hue} />

      <p className="text-[12px] text-muted-foreground/40 text-center z-10 font-mono" style={{ animation: "cv-fade-in 0.8s ease-out 0.6s both" }}>
        {typedText}
        <span className="inline-block w-[1px] h-[13px] ml-0.5 align-text-bottom" style={{ backgroundColor: tone(hue, 0, 60, 0.6), opacity: showCursor ? 1 : 0 }} />
      </p>
    </div>
  )
}
