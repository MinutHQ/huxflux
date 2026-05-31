import { IconMap } from "@tabler/icons-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function PlanPreview({ content }: { content: string }) {
  return (
    <div className="mb-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-emerald-500/20">
        <IconMap size={13} className="text-emerald-400" />
        <span className="text-[12px] font-medium text-emerald-400/90">Plan ready for review</span>
      </div>
      <div className="max-h-64 overflow-y-auto px-4 py-3">
        <div className="text-[12px] text-muted-foreground leading-relaxed prose prose-sm prose-invert max-w-none [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_p]:my-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:text-[11px] [&_code]:text-[11px] [&_table]:text-[11px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
