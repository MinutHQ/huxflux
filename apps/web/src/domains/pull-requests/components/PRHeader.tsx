import { Popover, PopoverContent, PopoverTrigger, cn } from "@huxflux/ui"
import { type PullRequest } from "@huxflux/shared"
import {
  IconAlertTriangle,
  IconChevronDown,
  IconCircleCheck,
  IconCopy,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { openExternal } from "@/lib/platform"
import type { PendingReviewComment, PRDetailsHeader } from "../pull-requests.types"
import { relativeTime } from "../utils"
import { CIChecksPopover } from "./CIChecksPopover"
import { MergeButton } from "./MergeButton"
import { SubmitReviewPopover } from "./SubmitReviewPopover"

interface PRHeaderProps {
  pr: PullRequest
  prDetails: PRDetailsHeader | null
  branch: string
  baseBranch: string
  checks: NonNullable<PullRequest["checks"]>
  mergeableState: string
  pendingComments: PendingReviewComment[]
  showSubmitPopover: boolean
  setShowSubmitPopover: (open: boolean) => void
  onReviewSubmitted: () => void
}

/** Header for the standalone PR review page: title, branch, author, status pills, submit button. */
export function PRHeader({
  pr,
  prDetails,
  branch,
  baseBranch,
  checks,
  mergeableState,
  pendingComments,
  showSubmitPopover,
  setShowSubmitPopover,
  onReviewSubmitted,
}: PRHeaderProps) {
  const title = prDetails?.title ?? pr.title
  const author = prDetails?.author ?? pr.author
  const avatarUrl = prDetails?.avatarUrl ?? pr.authorAvatar
  const createdAt = prDetails?.createdAt ?? pr.requestedAt
  const prUrl = prDetails?.url ?? pr.url

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <TitleRow number={pr.number} title={title} prUrl={prUrl} />
        <BranchRow repoId={pr.repoId} repo={pr.repo} baseBranch={baseBranch} branch={branch} />
        <MetaRow
          author={author}
          avatarUrl={avatarUrl}
          createdAt={createdAt}
          mergeableState={mergeableState}
          checks={checks}
          repoId={pr.repoId}
          prNumber={pr.number}
        />
      </div>

      <Popover open={showSubmitPopover} onOpenChange={setShowSubmitPopover}>
        <PopoverTrigger asChild>
          <button className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground hover:bg-foreground/90 text-background text-[12px] font-semibold transition-colors">
            Submit review
            {pendingComments.length > 0 && (
              <span className="bg-background/15 text-background rounded-full text-[10px] px-1.5 py-0.5 font-bold leading-none">
                {pendingComments.length}
              </span>
            )}
            <IconChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-[460px] p-0">
          <SubmitReviewPopover
            key={showSubmitPopover ? "open" : "closed"}
            pr={pr}
            pendingComments={pendingComments}
            onClose={() => setShowSubmitPopover(false)}
            onSubmitted={onReviewSubmitted}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function TitleRow({ number, title, prUrl }: { number: number; title: string; prUrl?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] font-mono text-muted-foreground/50 shrink-0">#{number}</span>
      {prUrl ? (
        <button
          onClick={() => openExternal(prUrl)}
          className="text-[14px] font-semibold text-foreground hover:text-foreground/70 transition-colors truncate text-left cursor-pointer"
        >
          {title}
        </button>
      ) : (
        <span className="text-[14px] font-semibold text-foreground truncate">{title}</span>
      )}
    </div>
  )
}

function BranchRow({
  repoId,
  repo,
  baseBranch,
  branch,
}: {
  repoId: string
  repo: string
  baseBranch: string
  branch: string
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 flex-wrap min-w-0">
      <span className="font-medium text-muted-foreground/80 shrink-0">{repoId || repo}</span>
      <span className="text-muted-foreground/30 shrink-0">·</span>
      <span className="font-mono shrink-0">{baseBranch}</span>
      <span className="text-muted-foreground/40 shrink-0">←</span>
      <span className="font-mono shrink-0">{branch}</span>
      <button
        onClick={() =>
          navigator.clipboard.writeText(branch).then(() => toast.success("Branch copied"))
        }
        className="text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0"
        title="Copy branch name"
      >
        <IconCopy size={11} />
      </button>
    </div>
  )
}

function MetaRow({
  author,
  avatarUrl,
  createdAt,
  mergeableState,
  checks,
  repoId,
  prNumber,
}: {
  author: string
  avatarUrl?: string
  createdAt?: string
  mergeableState: string
  checks: NonNullable<PullRequest["checks"]>
  repoId?: string
  prNumber: number
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      <AuthorPill author={author} avatarUrl={avatarUrl} />
      {createdAt && (
        <>
          <span className="text-muted-foreground/30 shrink-0">·</span>
          <span className="text-[11px] text-muted-foreground/50 shrink-0">{relativeTime(createdAt)}</span>
        </>
      )}
      {mergeableState === "dirty" && (
        <>
          <span className="text-muted-foreground/30 shrink-0">·</span>
          <span className="flex items-center gap-1 text-[11px] text-red-400 shrink-0">
            <IconAlertTriangle size={11} />
            Conflicting
          </span>
        </>
      )}
      {checks.length > 0 && (
        <>
          <span className="text-muted-foreground/30 shrink-0">·</span>
          <CIChecksPopover checks={checks} />
        </>
      )}
      {mergeableState && mergeableState !== "dirty" && mergeableState !== "unknown" && mergeableState !== "" && (
        <MergeStatusGroup mergeableState={mergeableState} repoId={repoId} prNumber={prNumber} />
      )}
    </div>
  )
}

function AuthorPill({ author, avatarUrl }: { author: string; avatarUrl?: string }) {
  return (
    <>
      {avatarUrl ? (
        <img src={avatarUrl} alt={author} className="w-4 h-4 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 text-[8px] text-muted-foreground/50 uppercase">
          {author?.slice(0, 1) ?? "?"}
        </div>
      )}
      <span className="text-[11px] text-muted-foreground/70 shrink-0">{author}</span>
    </>
  )
}

function MergeStatusGroup({
  mergeableState,
  repoId,
  prNumber,
}: {
  mergeableState: string
  repoId?: string
  prNumber: number
}) {
  return (
    <>
      <span className="text-muted-foreground/30 shrink-0">·</span>
      <span
        className={cn(
          "flex items-center gap-1 text-[11px] shrink-0",
          mergeableState === "clean" ? "text-emerald-400" : "text-yellow-400",
        )}
      >
        {mergeableState === "clean" ? <IconCircleCheck size={11} /> : <IconAlertTriangle size={11} />}
        {mergeableState === "clean" ? "Ready to merge" : mergeableState === "blocked" ? "Blocked" : "Unstable"}
      </span>
      {mergeableState === "clean" && repoId && <MergeButton repoId={repoId} prNumber={prNumber} />}
    </>
  )
}
