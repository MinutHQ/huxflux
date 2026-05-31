import { useState } from "react"
import { cn } from "@huxflux/ui"
import {
  IconBolt,
  IconChevronRight,
  IconCircleX,
  IconFolderSymlink,
  IconGitBranch,
  IconGitPullRequest,
} from "@tabler/icons-react"
import { stripHuxfluxTags } from "../utils"
import { MarkdownContent } from "./MarkdownContent"

interface LinkedWorkspaceMessageProps {
  sender: string
  content: string
  icon?: "workspace" | "system"
}

function SystemIcon({ isCIFailed, isMergeConflict, isPRReview }: { isCIFailed: boolean; isMergeConflict: boolean; isPRReview: boolean }) {
  if (isCIFailed) return <IconCircleX size={14} className="text-red-400 shrink-0" />
  if (isMergeConflict) return <IconGitBranch size={14} className="text-orange-400 shrink-0" />
  if (isPRReview) return <IconGitPullRequest size={14} className="text-amber-400 shrink-0" />
  return <IconBolt size={14} className="text-blue-400 shrink-0" />
}

function SystemEventCard({ sender, content }: { sender: string; content: string }) {
  const [open, setOpen] = useState(false)

  // Detect specific event types for richer cards
  const isPRReview = sender === "PR Review"
  const isCIMonitor = sender === "CI Monitor"
  const isMergeConflict = sender === "Merge Conflict"
  const isCIFailed = isCIMonitor && /fail/i.test(content)

  const subtitle = isPRReview ? "Review comments"
    : isCIFailed ? "Checks failed"
    : isMergeConflict ? "Conflicts detected"
    : "Update"

  return (
    <div className="mb-5">
      <div className={cn(
        "rounded-xl border overflow-hidden",
        isCIFailed ? "border-red-500/20 bg-red-500/5" :
        isMergeConflict ? "border-orange-500/20 bg-orange-500/5" :
        isPRReview ? "border-amber-500/20 bg-amber-500/5" :
        "border-border/50 bg-card"
      )}>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
        >
          <SystemIcon isCIFailed={isCIFailed} isMergeConflict={isMergeConflict} isPRReview={isPRReview} />
          <span className="text-[12px] font-medium text-foreground/80 flex-1">{sender}</span>
          <span className="text-[10px] text-muted-foreground/40">{subtitle}</span>
          <IconChevronRight size={11} className={cn("transition-transform text-muted-foreground/30", open && "rotate-90")} />
        </button>
        {open && (
          <div className="px-3.5 pb-3 border-t border-border/20">
            <div className="pt-2.5 text-[12px] text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px] [&_strong]:text-foreground">
              <MarkdownContent content={stripHuxfluxTags(content)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WorkspaceMessageCard({ sender, content }: { sender: string; content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <IconChevronRight size={12} className={cn("transition-transform shrink-0 text-muted-foreground/40", open && "rotate-90")} />
        <IconFolderSymlink size={13} className="text-blue-400/60 shrink-0" />
        <span>Linked workspace <span className="font-medium text-foreground/70">{sender}</span> sent message</span>
      </button>
      {open && (
        <div className="ml-[22px] mt-1.5 pl-3 border-l border-blue-400/15">
          <div className="text-sm text-foreground/80 leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:ml-3 [&_ol]:ml-3 [&_li]:mb-0.5 [&_code]:text-[11px] [&_pre]:text-[11px]">
            <MarkdownContent content={stripHuxfluxTags(content)} />
          </div>
        </div>
      )}
    </div>
  )
}

export function LinkedWorkspaceMessage({ sender, content, icon = "workspace" }: LinkedWorkspaceMessageProps) {
  if (icon === "system") return <SystemEventCard sender={sender} content={content} />
  return <WorkspaceMessageCard sender={sender} content={content} />
}
