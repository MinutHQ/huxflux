import type { ReactNode } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@huxflux/ui"
import type { AgentWorkspaceLayout } from "../../hooks/useAgentWorkspaceLayout"

const card = "h-full rounded-xl bg-card border border-border/40 overflow-hidden"

interface WorkspacePanelsProps {
  ui: AgentWorkspaceLayout
  chat: ReactNode
  top: ReactNode | null
  terminal: ReactNode | null
}

/**
 * Resizable arrangement of the workspace: chat | side pane, where the side
 * pane stacks the top section over the terminal (or the terminal spans the
 * bottom when moved there). A maximized section replaces everything.
 */
export function WorkspacePanels({ ui, chat, top, terminal }: WorkspacePanelsProps) {
  const { maximized } = ui.layout
  const maximizedContent = maximized === "top" ? top : maximized === "terminal" ? terminal : null
  const terminalOnSide = ui.terminalPosition === "right" && !!terminal
  const terminalAtBottom = ui.terminalPosition === "bottom" && !!terminal
  const sideVisible = !!top || terminalOnSide

  if (maximizedContent) {
    return <div className="flex-1 min-h-0 p-1 pt-0"><div className={card}>{maximizedContent}</div></div>
  }

  return (
    <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0 gap-1 p-1 pt-0">
      <ResizablePanel defaultSize={terminalAtBottom ? 70 : 100} minSize={30}>
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full gap-1"
          defaultLayout={ui.mainLayout.defaultLayout}
          onLayoutChanged={ui.mainLayout.onLayoutChanged}
        >
          <ResizablePanel id="huxflux-main-chat" defaultSize="50" minSize="25">
            <div className={`flex flex-col ${card}`}>{chat}</div>
          </ResizablePanel>
          {sideVisible && <ResizableHandle className="w-0 bg-transparent" />}
          {sideVisible && (
            <ResizablePanel id="huxflux-main-side" defaultSize="50" minSize="20">
              {top && terminalOnSide ? (
                <ResizablePanelGroup
                  orientation="vertical"
                  className="h-full gap-1"
                  defaultLayout={ui.sideLayout.defaultLayout}
                  onLayoutChanged={ui.sideLayout.onLayoutChanged}
                >
                  <ResizablePanel id="huxflux-side-top" defaultSize="65" minSize="20"><div className={card}>{top}</div></ResizablePanel>
                  <ResizableHandle className="h-0 bg-transparent" />
                  <ResizablePanel id="huxflux-side-terminal" defaultSize="35" minSize="10"><div className={card}>{terminal}</div></ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <div className={card}>{top ?? terminal}</div>
              )}
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      </ResizablePanel>
      {terminalAtBottom && (
        <>
          <ResizableHandle className="h-0 bg-transparent" />
          <ResizablePanel defaultSize={30} minSize={10}><div className={card}>{terminal}</div></ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
