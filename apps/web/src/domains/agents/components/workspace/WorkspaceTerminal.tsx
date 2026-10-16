import { useNavigate } from "@tanstack/react-router"
import { Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconDots, IconLayoutBottombar, IconLayoutSidebar } from "@tabler/icons-react"
import type { Agent } from "@huxflux/shared"
import { TerminalView } from "../TerminalView"
import type { TerminalTopTab } from "../../agents.types"
import { PaneWindowControls } from "./PaneWindowControls"

interface WorkspaceTerminalProps {
  agent: Agent
  activeTab: TerminalTopTab
  onTabChange: (tab: TerminalTopTab) => void
  position: "right" | "bottom"
  onPositionChange: (position: "right" | "bottom") => void
  maximized: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

/** The terminal section of the agent workspace, with its position menu and window controls overlaid top-right. */
export function WorkspaceTerminal({ agent, activeTab, onTabChange, position, onPositionChange, maximized, onToggleMaximize, onClose }: WorkspaceTerminalProps) {
  const navigate = useNavigate()
  return (
    <div className="relative h-full">
      <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 bg-card rounded-md">
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors" title="Terminal options">
              <IconDots size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-40 p-1">
            <button
              onClick={() => onPositionChange(position === "right" ? "bottom" : "right")}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-foreground hover:bg-accent rounded-md transition-colors"
            >
              {position === "right" ? (
                <><IconLayoutBottombar size={14} className="text-muted-foreground" /> Move to bottom</>
              ) : (
                <><IconLayoutSidebar size={14} className="text-muted-foreground" /> Move to side</>
              )}
            </button>
          </PopoverContent>
        </Popover>
        <PaneWindowControls maximized={maximized} onToggleMaximize={onToggleMaximize} onClose={onClose} />
      </div>
      <TerminalView
        key={agent.id}
        agent={agent}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onOpenSettings={() => navigate({ to: "/settings" })}
        onPortChange={() => {}}
      />
    </div>
  )
}
