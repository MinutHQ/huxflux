import { cn } from "@huxflux/ui"
import type { ColorTheme } from "@/lib/colorThemes"

export function ThemeCard({ theme, active, onClick }: { theme: ColorTheme; active: boolean; onClick: () => void }) {
  const [bg, sidebar, accent, fg] = theme.preview
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg p-2 border-2 transition-all cursor-pointer text-left",
        active
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-muted-foreground/30"
      )}
    >
      <div className="rounded-md overflow-hidden w-full aspect-[16/10] flex" style={{ background: bg }}>
        <div className="w-[28%] h-full flex flex-col gap-[3px] p-1.5" style={{ background: sidebar }}>
          <div className="h-[3px] rounded-full w-3/4" style={{ background: accent, opacity: 0.7 }} />
          <div className="h-[3px] rounded-full w-full" style={{ background: fg, opacity: 0.15 }} />
          <div className="h-[3px] rounded-full w-4/5" style={{ background: fg, opacity: 0.15 }} />
          <div className="h-[3px] rounded-full w-full" style={{ background: fg, opacity: 0.15 }} />
        </div>
        <div className="flex-1 p-1.5 flex flex-col gap-[3px]">
          <div className="h-[3px] rounded-full w-3/5" style={{ background: accent, opacity: 0.5 }} />
          <div className="h-[3px] rounded-full w-full" style={{ background: fg, opacity: 0.12 }} />
          <div className="h-[3px] rounded-full w-4/5" style={{ background: fg, opacity: 0.12 }} />
          <div className="h-[3px] rounded-full w-2/3" style={{ background: fg, opacity: 0.12 }} />
          <div className="flex-1" />
          <div className="h-[6px] rounded-sm" style={{ background: accent, opacity: 0.25 }} />
        </div>
      </div>
      <span className="text-xs font-medium truncate px-0.5">{theme.name}</span>
    </button>
  )
}
