import { cn } from "@huxflux/ui"
import type { AppIconOption } from "@/lib/appIcon"

export function AppIconCard({ option, active, onClick }: { option: AppIconOption; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg p-3 border-2 transition-all cursor-pointer w-28",
        active
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-muted-foreground/30"
      )}
    >
      <img src={option.preview} alt="" className="size-14" draggable={false} />
      <span className="text-xs font-medium truncate">{option.name}</span>
    </button>
  )
}
