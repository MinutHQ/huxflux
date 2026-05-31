import { useCallback, useRef, useState, type ReactNode } from "react"
import { cn } from "@huxflux/ui"
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber"
import { formatNum } from "./homeUtils"
import { OrbitDots } from "./OrbitDots"
import { Sparkline } from "./Sparkline"

export interface HeroCardProps {
  icon: ReactNode
  label: string
  value: number
  color: string
  /** Tailwind color name suffix for the hover shadow ("blue", "violet", etc.). */
  colorClass: string
  visible: boolean
  sparkData?: number[]
}

/**
 * Hero stat card: oversized animated number, label, icon block, optional
 * sparkline. Tilts toward the cursor on mouse-move (perspective transform),
 * sweeps a shimmer + glow on hover, and stagger-fades in once `visible` flips.
 */
export function HeroCard({ icon, label, value, color, colorClass, visible, sparkData }: HeroCardProps) {
  const animatedValue = useAnimatedNumber(visible ? value : 0)
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const handleMouse = useCallback((e: React.MouseEvent) => {
    // Reading the rect inside the event handler is fine — happens after render,
    // not during it.
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -12
    setTilt({ x, y })
  }, [])

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouse}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      className={cn(
        "group relative border border-border rounded-xl p-4 flex flex-col gap-3 overflow-hidden cursor-default",
        `hover:border-${colorClass}-500/30 hover:shadow-xl hover:shadow-${colorClass}-500/10`,
        "transition-shadow duration-500",
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? `perspective(600px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) scale(1)`
          : "perspective(600px) translateY(24px) scale(0.9)",
        transition: "opacity 600ms, transform 400ms ease-out",
        background: `linear-gradient(135deg, ${color}10 0%, transparent 60%)`,
      }}
    >
      <HeroCardBorderGlow color={color} />
      <div className="home-shimmer absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div
        className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 blur-3xl"
        style={{ background: color, opacity: "inherit" }}
      />

      <div className="relative flex items-start justify-between">
        <HeroCardIcon icon={icon} color={color} />
        {sparkData && sparkData.length > 1 && (
          <div className="opacity-40 group-hover:opacity-100 transition-opacity duration-500">
            <Sparkline data={sparkData} color={color} height={32} />
          </div>
        )}
      </div>

      <div className="relative">
        <div className="text-4xl font-black tabular-nums tracking-tighter" style={{ color }}>
          {formatNum(animatedValue)}
        </div>
        <div className="text-[11px] text-muted-foreground/50 font-semibold uppercase tracking-wider mt-1">{label}</div>
      </div>
    </div>
  )
}

function HeroCardBorderGlow({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
      style={{
        background: `conic-gradient(from var(--home-border-angle, 0deg), transparent 40%, ${color}30 50%, transparent 60%)`,
        animation: "homeBorderRotate 3s linear infinite",
        mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        maskComposite: "exclude",
        padding: "1px",
        borderRadius: "inherit",
      }}
    />
  )
}

function HeroCardIcon({ icon, color }: { icon: ReactNode; color: string }) {
  return (
    <div className="relative">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6"
        style={{
          background: `linear-gradient(135deg, ${color}25, ${color}10)`,
          border: `1px solid ${color}20`,
          boxShadow: `0 0 0 0 ${color}00`,
          color,
        }}
      >
        {icon}
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <OrbitDots color={color} size={44} />
      </div>
    </div>
  )
}
