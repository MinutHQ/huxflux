import type { ReactNode } from "react"
import { IconFlame } from "@tabler/icons-react"

interface HomeHeaderProps {
  loaded: boolean
  streak: number
  achievement: { icon: ReactNode; text: string } | null
}

/**
 * Top of the home dashboard: animated rainbow "Huxflux" wordmark, subtitle,
 * optional amber achievement pill, and an orange flame streak counter. The
 * whole header slides + fades down once stats finish loading.
 */
export function HomeHeader({ loaded, streak, achievement }: HomeHeaderProps) {
  return (
    <div
      className="mb-10 transition-all duration-1000"
      style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(-20px)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 tracking-tight pb-1"
            style={{ animation: "homeRainbow 8s linear infinite" }}
          >
            Huxflux
          </h1>
          <p className="text-sm text-muted-foreground/60 mt-1">Lifetime workspace stats</p>
        </div>
        <div className="flex items-center gap-2">
          {achievement && <AchievementPill icon={achievement.icon} text={achievement.text} />}
          {streak > 0 && <StreakPill streak={streak} />}
        </div>
      </div>
    </div>
  )
}

function AchievementPill({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-full px-3 py-1.5 text-amber-400 animate-in fade-in zoom-in-95 duration-700">
      {icon}
      <span className="text-[11px] font-bold">{text}</span>
    </div>
  )
}

function StreakPill({ streak }: { streak: number }) {
  return (
    <div className="relative flex items-center gap-2 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-full px-3.5 py-1.5 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="absolute inset-0 rounded-full" style={{ animation: "homeGlow 2s ease-in-out infinite", background: "rgba(249, 115, 22, 0.05)" }} />
      <IconFlame size={16} className="text-orange-400 relative" style={{ animation: "homeGlow 1.5s ease-in-out infinite" }} />
      <span className="text-[15px] font-black text-orange-400 tabular-nums relative">{streak}</span>
      <span className="text-[11px] text-orange-400/60 relative">day{streak > 1 ? "s" : ""}</span>
    </div>
  )
}
