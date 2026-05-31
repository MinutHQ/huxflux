import { toast } from "sonner"
import { cn, Button } from "@huxflux/ui"
import { IconArrowUpRight } from "@tabler/icons-react"
import { api, useHuxfluxMutation } from "@huxflux/shared"
import type { PRStatus } from "@huxflux/shared"
import { handleExternalClick } from "@/lib/platform"

function pillLabel(prStatus: PRStatus, isReadyToMerge: boolean): { label: string; pill: string } {
  if (prStatus.merged)
    return { label: "Merged", pill: "bg-purple-500/10 border-purple-500/25 text-purple-400" }
  if (prStatus.draft)
    return { label: "Draft PR open", pill: "bg-muted/40 border-border text-muted-foreground" }
  if (prStatus.hasChangeRequests)
    return { label: "PR changes requested", pill: "bg-orange-500/10 border-orange-500/25 text-orange-400" }
  if (prStatus.mergeableState === "blocked" || prStatus.mergeableState === "dirty")
    return { label: prStatus.mergeableState === "dirty" ? "Merge conflict" : "Blocked", pill: "bg-red-500/10 border-red-500/25 text-red-400" }
  if (isReadyToMerge)
    return { label: "Ready to merge", pill: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" }
  return { label: "In review", pill: "bg-blue-500/10 border-blue-500/25 text-blue-400" }
}

export function PRStatusPill({ prStatus, agentId }: { prStatus: PRStatus; agentId: string }) {
  const markReadyMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.markReady(agentId),
  })
  const rerequestMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.rerequestReview(agentId),
    onSuccess: () => toast.success("Review re-requested"),
    onError: (err) => toast.error(`Failed to re-request review: ${err instanceof Error ? err.message : "unknown error"}`),
  })
  const mergeMut = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.merge(agentId),
    onSuccess: () => toast.success("PR merged"),
    onError: (err) => toast.error(`Merge failed: ${err instanceof Error ? err.message : "unknown error"}`),
  })

  const handleMarkReady = () => markReadyMut.mutate()
  const handleRerequestReview = () => rerequestMut.mutate()
  const handleMerge = () => mergeMut.mutate()
  const marking = markReadyMut.isPending
  const rerequesting = rerequestMut.isPending
  const merging = mergeMut.isPending

  const isReadyToMerge = prStatus.state === "open" && !prStatus.draft && !prStatus.hasChangeRequests && prStatus.mergeableState !== "behind" && prStatus.mergeableState !== "blocked" && prStatus.mergeableState !== "dirty"
  const { label, pill } = pillLabel(prStatus, isReadyToMerge)

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={prStatus.url}
        target="_blank"
        rel="noreferrer"
        onClick={handleExternalClick}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary border border-border text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors"
      >
        #{prStatus.number}
        <IconArrowUpRight size={10} />
      </a>
      <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium", pill)}>
        {label}
      </div>
      {isReadyToMerge && (
        <Button
          size="sm"
          className="h-5 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md"
          onClick={handleMerge}
          disabled={merging}
        >
          {merging ? "Merging…" : "Merge"}
        </Button>
      )}
      {prStatus.draft && !prStatus.merged && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-md"
          onClick={handleMarkReady}
          disabled={marking}
        >
          Mark ready
        </Button>
      )}
      {(prStatus.hasChangeRequests || prStatus.hasDismissedReviews) && !prStatus.merged && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={handleRerequestReview}
          disabled={rerequesting}
        >
          Re-request review
        </Button>
      )}
    </div>
  )
}
