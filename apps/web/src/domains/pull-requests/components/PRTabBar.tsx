import { cn } from "@huxflux/ui"

export type PRTab = "conversations" | "changes"

const LABELS: Record<PRTab, string> = {
  conversations: "Conversations",
  changes: "Changes",
}

interface PRTabBarProps {
  activeTab: PRTab
  setActiveTab: (tab: PRTab) => void
  counts: Partial<Record<PRTab, number | undefined>>
}

/** Tab bar under the header on the standalone PR review page. */
export function PRTabBar({ activeTab, setActiveTab, counts }: PRTabBarProps) {
  return (
    <div className="flex items-center gap-1 mt-3">
      {(["conversations", "changes"] as const).map((tab) => {
        const count = counts[tab]
        return (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
              activeTab === tab
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
            )}
          >
            {LABELS[tab]}
            {count != null && (
              <span
                className={cn(
                  "text-[10px] font-mono px-1 py-0.5 rounded",
                  activeTab === tab ? "bg-foreground/10 text-foreground/70" : "bg-secondary text-muted-foreground/50",
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
