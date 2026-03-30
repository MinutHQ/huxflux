import { useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Agent } from "@/data/mock"
import { IconTerminal2, IconPlayerPlay, IconChevronDown, IconPlus } from "@tabler/icons-react"

interface TerminalViewProps {
  agent: Agent
  activeTab: "setup" | "run" | "terminal"
  onTabChange: (tab: "setup" | "run" | "terminal") => void
}

function parseLine(line: string): { type: "command" | "success" | "error" | "info"; text: string } {
  if (line.startsWith("$ ")) return { type: "command", text: line }
  if (line.startsWith("✓") || line.startsWith("Done") || line.startsWith("✔")) return { type: "success", text: line }
  if (line.includes("error") || line.includes("Error") || line.includes("→")) return { type: "error", text: line }
  return { type: "info", text: line }
}

export function TerminalView({ agent, activeTab, onTabChange }: TerminalViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [agent.id])

  const isActive = agent.status === "in-progress"

  return (
    <div className="flex flex-col h-full bg-background border-t border-border">
      {/* Tab bar */}
      <div className="flex items-center px-3 border-b border-border shrink-0">
        {(["setup", "run", "terminal"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize -mb-px",
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "terminal" && <IconTerminal2 size={12} />}
            {tab === "run" && <IconPlayerPlay size={12} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <button className="ml-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors pb-0.5">
          <IconPlus size={13} />
        </button>
        <div className="ml-auto pb-0.5">
          <button className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
            <IconChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Terminal output */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-3 font-mono text-[12px] leading-5">
            {agent.terminalOutput.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground/40">
                <IconTerminal2 size={13} />
                <span>No output</span>
              </div>
            ) : (
              agent.terminalOutput.map((line, i) => {
                const { type, text } = parseLine(line)
                return (
                  <div
                    key={i}
                    className={cn(
                      "whitespace-pre-wrap break-all leading-5",
                      type === "command" && "text-foreground/80",
                      type === "success" && "text-emerald-400",
                      type === "error" && "text-red-400",
                      type === "info" && "text-muted-foreground"
                    )}
                  >
                    {type === "command" ? (
                      <>
                        <span className="text-muted-foreground/50">❯</span>{" "}
                        <span>{text.slice(2)}</span>
                      </>
                    ) : (
                      text
                    )}
                  </div>
                )
              })
            )}
            {isActive && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-muted-foreground/50">❯</span>
                <span className="w-1.5 h-4 bg-foreground/70 animate-pulse inline-block ml-0.5" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
