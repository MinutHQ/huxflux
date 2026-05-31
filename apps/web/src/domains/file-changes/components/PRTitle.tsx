import { IconArrowUpRight } from "@tabler/icons-react"
import { handleExternalClick } from "@/lib/platform"

interface PRTitleProps {
  url: string
  title: string
  number: number
  author: string
}

/** PR title row at the top of the AgentPRTab. */
export function PRTitle({ url, title, number, author }: PRTitleProps) {
  return (
    <div className="space-y-1">
      <a href={url} target="_blank" rel="noreferrer" onClick={handleExternalClick} className="flex items-start gap-1.5 group">
        <span className="text-[13px] font-medium text-foreground leading-snug group-hover:underline">{title}</span>
        <IconArrowUpRight size={12} className="text-muted-foreground/50 shrink-0 mt-0.5" />
      </a>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground/60 font-mono">#{number}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="text-[11px] text-muted-foreground/60">{author}</span>
      </div>
    </div>
  )
}
