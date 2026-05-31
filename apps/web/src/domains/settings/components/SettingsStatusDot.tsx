import { cn } from "@huxflux/ui"

export function SettingsStatusDot({ status }: { status: "online" | "offline" | "checking" }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-400",
        status === "offline" && "bg-red-400",
        status === "checking" && "bg-amber-400 animate-pulse"
      )}
    />
  )
}
