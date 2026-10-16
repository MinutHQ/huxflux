import { cn } from "@huxflux/ui"
import { SWITCHER_LAYOUTS, setSwitcherLayout, useSwitcherLayout } from "./switcherLayout"

/** Prototype-only segmented control for trying the switcher layouts side by side. */
export function LayoutPicker() {
  const layout = useSwitcherLayout()
  return (
    <div className="border-t border-border px-2.5 py-2 flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground/70">Layout</span>
      <div className="flex-1 flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
        {SWITCHER_LAYOUTS.map((l) => (
          <button
            key={l.id}
            onClick={() => setSwitcherLayout(l.id)}
            className={cn(
              "flex-1 text-[11px] rounded px-1.5 py-0.5 transition-colors",
              layout === l.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}
