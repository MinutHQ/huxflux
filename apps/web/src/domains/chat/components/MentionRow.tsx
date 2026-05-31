import React, { useState } from "react"
import { cn } from "@huxflux/ui"
import { IconFileCode, IconTerminal2 } from "@tabler/icons-react"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"

interface MentionRowProps {
  option: { type: "file" | "terminal"; name: string; path: string }
  agentId: string
  isActive: boolean
  onSelect: () => void
  rowRef?: React.Ref<HTMLDivElement>
}

function MentionPreview({ option, lines }: { option: MentionRowProps["option"]; lines: string[] }) {
  return (
    <div className="absolute left-full top-0 ml-2 w-[380px] z-20 rounded-xl border border-border bg-[#0d0d0d] shadow-2xl overflow-hidden pointer-events-none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-[#141414]">
        <div className="flex items-center gap-2">
          <IconTerminal2 size={11} className="text-muted-foreground/50" />
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
            {option.type === "terminal" ? "Terminal" : option.path}
          </span>
        </div>
        {option.type === "terminal" && (
          <span className="text-[10px] text-emerald-400/70 font-medium">● running</span>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.slice(-40).map((line, i) => {
              const lineNum = option.type === "terminal"
                ? lines.length - 40 + i + 1
                : i + 1
              return (
                <tr key={i} className="hover:bg-white/[0.03]">
                  <td className="select-none text-right pr-3 pl-3 py-[1px] text-[10px] font-mono text-white/20 w-8 shrink-0 align-top">
                    {lineNum > 0 ? lineNum : i + 1}
                  </td>
                  <td className="pr-3 py-[1px] text-[11px] font-mono text-white/70 leading-relaxed whitespace-pre break-all">
                    {line || " "}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function MentionRow({ option, agentId, isActive, onSelect, rowRef }: MentionRowProps) {
  const [open, setOpen] = useState(false)
  const { data: previewLines } = useHuxfluxQuery({
    queryKey: queryKeys.agents.mentionPreview(agentId, option.type === "terminal" ? "__terminal__" : option.path),
    queryFn: () =>
      option.type === "terminal"
        ? api.agents.terminal(agentId)
        : api.agents.fileContent(agentId, option.path).then((c) => c.split("\n")),
    enabled: open,
    staleTime: 30_000,
  })

  const dir = option.path.includes("/") ? option.path.split("/").slice(0, -1).join("/") + "/" : ""
  const lines: string[] = previewLines ?? []

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onMouseDown={(e) => { e.preventDefault(); onSelect() }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
          isActive ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        {option.type === "terminal"
          ? <IconTerminal2 size={13} className="text-muted-foreground/60 shrink-0" />
          : <IconFileCode size={13} className="text-muted-foreground/60 shrink-0" />
        }
        <span className="text-[12px] font-medium text-foreground/80 shrink-0">{option.name}</span>
        {dir && <span className="text-[11px] text-muted-foreground/40 truncate">{dir}</span>}
      </button>
      {open && lines.length > 0 && (
        <MentionPreview option={option} lines={lines} />
      )}
    </div>
  )
}
