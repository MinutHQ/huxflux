import { useEffect, useRef, useState } from "react"
import type { PullRequest, AgentSummary } from "@huxflux/shared"
import { SidebarHeader } from "./SidebarHeader"
import { FeedbackDialog } from "@/app-shell/FeedbackDialog"
import { AgentList } from "@/domains/agents/AgentList"
import { ActiveProcesses } from "@/domains/agents/ActiveProcesses"
import type { RefineSession } from "@/domains/tasks/tasks.types"
import { getFlag } from "@/lib/flags"
import { HelpPopover } from "./HelpPopover"
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog"
import { PRPane } from "./pr-list/PRPane"
import { RefinePane } from "@/domains/tasks/RefinePane"
import { SidebarFooter } from "./SidebarFooter"
import { SidebarNav } from "./SidebarNav"
import { SidebarTabs } from "./SidebarTabs"
import type { SidebarTab } from "./types"

interface SidebarProps {
  agents: AgentSummary[]
  onOpenSettings: () => void
  prs: PullRequest[]
  prsLoading?: boolean
  onRefetchPRs?: () => void
  refineSessions?: RefineSession[]
  onNewRefine?: (ticketId: string) => void
  feedbackEnabled?: boolean
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

/**
 * The application sidebar: header (usage readout + collapse toggle), quick-nav
 * buttons (Home/Tasks), an
 * optional 3-way tab strip (Agents / Review / Refine, gated on flags), the
 * active pane, the active-processes panel, and the footer (server switcher +
 * help + settings).
 *
 * State ownership:
 *  - Collapsed/expanded panel state lives in the route (`_app.tsx`). The
 *    collapse toggle button is rendered in this sidebar's header (right edge),
 *    driven by the `sidebarCollapsed` / `onToggleSidebar` props; the route
 *    keeps a separate floating expand button for the collapsed state.
 *  - Tab choice and agent-list filters are persisted to localStorage by the
 *    individual panes / `SidebarTabs`.
 *  - Help / shortcuts dialog visibility is local to this component.
 */
export function Sidebar({
  agents,
  onOpenSettings,
  prs,
  prsLoading = false,
  onRefetchPRs,
  refineSessions = [],
  onNewRefine,
  feedbackEnabled = false,
  sidebarCollapsed,
  onToggleSidebar,
}: SidebarProps) {
  const prReviewEnabled = getFlag("prReview")
  const refineEnabled = getFlag("refine")
  const unreadPrCount = prs.filter((p) => p.unread).length

  const [tab, setTabRaw] = useState<SidebarTab>(() => (localStorage.getItem("hive:sidebar:tab") as SidebarTab) || "agents")
  const setTab = (v: SidebarTab) => { setTabRaw(v); localStorage.setItem("hive:sidebar:tab", v) }

  const [showFeedback, setShowFeedback] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const helpBtnRef = useRef<HTMLButtonElement>(null)
  const sidebarContainerRef = useRef<HTMLDivElement>(null)

  // Global shortcut event for opening the shortcuts dialog (⌘/).
  useEffect(() => {
    function onOpenShortcuts() { setShowShortcuts(true) }
    window.addEventListener("huxflux:open-shortcuts", onOpenShortcuts)
    return () => window.removeEventListener("huxflux:open-shortcuts", onOpenShortcuts)
  }, [])

  // When both PR-review and Refine are disabled, the Agents tab is the only
  // option and `tab` may be persisted as "review"/"refine" from an earlier
  // session. Effectively pin to agents in that case.
  const effectiveTab: SidebarTab = (!prReviewEnabled && !refineEnabled) ? "agents"
    : tab === "review" && !prReviewEnabled ? "agents"
    : tab === "refine" && !refineEnabled ? "agents"
    : tab

  return (
    <>
      <div ref={sidebarContainerRef} className="flex flex-col h-full bg-sidebar/80 backdrop-blur-xl w-full overflow-hidden">
        <SidebarHeader sidebarCollapsed={sidebarCollapsed} onToggleSidebar={onToggleSidebar} />

        <SidebarNav />
        <SidebarTabs
          tab={effectiveTab}
          onTabChange={setTab}
          prReviewEnabled={prReviewEnabled}
          refineEnabled={refineEnabled}
          unreadPrCount={unreadPrCount}
        />

        {effectiveTab === "refine" && refineEnabled ? (
          <RefinePane refineSessions={refineSessions} onNewRefine={onNewRefine} />
        ) : effectiveTab === "review" && prReviewEnabled ? (
          <PRPane
            prs={prs}
            prsLoading={prsLoading}
            onRefetchPRs={onRefetchPRs}
            containerRef={sidebarContainerRef}
          />
        ) : (
          <AgentList agents={agents} containerRef={sidebarContainerRef} />
        )}

        <ActiveProcesses />

        <SidebarFooter
          helpBtnRef={helpBtnRef}
          onToggleHelp={() => setShowHelp((v) => !v)}
          onOpenSettings={onOpenSettings}
        />
      </div>

      {showFeedback && <FeedbackDialog onClose={() => setShowFeedback(false)} />}
      {showHelp && (
        <HelpPopover
          feedbackEnabled={feedbackEnabled}
          onFeedback={() => setShowFeedback(true)}
          onClose={() => setShowHelp(false)}
          onShowShortcuts={() => setShowShortcuts(true)}
          anchorRef={helpBtnRef}
        />
      )}
      {showShortcuts && <KeyboardShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </>
  )
}
