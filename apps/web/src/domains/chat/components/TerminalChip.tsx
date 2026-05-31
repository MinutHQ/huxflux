import { useRef, useState } from "react"
import { IconTerminal2, IconX } from "@tabler/icons-react"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"

export function TerminalChip({ agentId, onRemove }: { agentId: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always fetch so data is ready before first hover
  const { data: lines = [] } = useHuxfluxQuery({
    queryKey: queryKeys.agents.terminalPreview(agentId),
    queryFn: () => api.agents.terminal(agentId),
    staleTime: 10_000,
  })

  function handleEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px] cursor-default">
        <IconTerminal2 size={12} className="text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-foreground/80">Terminal output</span>
        <button onClick={onRemove} className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5">
          <IconX size={11} />
        </button>
      </div>
      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 w-[400px] rounded-xl border border-border bg-[#0d0d0d] shadow-2xl overflow-hidden"
          style={{ zIndex: 9999 }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-[#141414]">
            <div className="flex items-center gap-2">
              <IconTerminal2 size={11} className="text-muted-foreground/50" />
              <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Terminal</span>
            </div>
            <span className="text-[10px] text-emerald-400/70 font-medium">● running</span>
          </div>
          {lines.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] font-mono text-white/30">No terminal output yet</div>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full border-collapse">
                <tbody>
                  {lines.slice(-40).map((line, i) => (
                    <tr key={i} className="hover:bg-white/[0.03]">
                      <td className="select-none text-right pr-3 pl-3 py-[1px] text-[10px] font-mono text-white/20 w-8 shrink-0 align-top">
                        {Math.max(lines.length - 40, 0) + i + 1}
                      </td>
                      <td className="pr-3 py-[1px] text-[11px] font-mono text-white/70 leading-relaxed whitespace-pre">
                        {line || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
