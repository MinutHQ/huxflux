import { IconMap, IconChevronDown, IconChevronRight } from "@tabler/icons-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function PlanPreview({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const Chevron = collapsed ? IconChevronRight : IconChevronDown
  return (
    <div className="mb-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emerald-500/10 transition-colors"
        aria-expanded={!collapsed}
      >
        <IconMap size={13} className="text-emerald-400" />
        <span className="text-[12px] font-medium text-emerald-400/90">Plan ready for review</span>
        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-emerald-400/70">
          {collapsed ? "Show" : "Hide"}
          <Chevron size={14} />
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3 border-t border-emerald-500/20">
          <div className="text-[12px] text-muted-foreground leading-relaxed prose prose-sm prose-invert max-w-none [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_p]:my-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:text-[11px] [&_code]:text-[11px] [&_table]:text-[11px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
