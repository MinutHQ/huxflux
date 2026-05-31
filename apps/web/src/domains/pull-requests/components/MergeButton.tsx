import { useEffect, useState } from "react"
import { api, useHuxfluxMutation } from "@huxflux/shared"
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@huxflux/ui"
import { IconChevronDown } from "@tabler/icons-react"
import { toast } from "sonner"
import { MERGE_LABELS } from "../config"
import type { MergeMethod } from "../pull-requests.types"

interface MergeButtonProps {
  repoId: string
  prNumber: number
}

/**
 * Single button (or split-button with menu) for merging a PR with the
 * methods allowed by the repo's branch protection rules.
 */
export function MergeButton({ repoId, prNumber }: MergeButtonProps) {
  const [method, setMethod] = useState<MergeMethod | null>(null)
  const [methods, setMethods] = useState<MergeMethod[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api.prs
      .mergeMethods(repoId)
      .then((r) => {
        setMethods(r.methods)
        if (r.methods.length > 0) setMethod(r.methods[0] ?? null)
      })
      .catch(() => setMethods(["merge"]))
  }, [repoId])

  const mergeMut = useHuxfluxMutation<unknown, MergeMethod | undefined>({
    mutationFn: (m) => api.prs.mergeByRepo(repoId, prNumber, m ?? method ?? undefined),
    onSuccess: () => toast.success(`PR #${prNumber} merged`),
    onError: (err) => toast.error(`Merge failed: ${err instanceof Error ? err.message : "unknown error"}`),
  })
  const merging = mergeMut.isPending

  const handleMerge = (m?: MergeMethod) => {
    setOpen(false)
    mergeMut.mutate(m)
  }

  if (methods.length <= 1) {
    return (
      <Button
        size="sm"
        className="h-5 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md shrink-0"
        disabled={merging}
        onClick={() => handleMerge()}
      >
        {merging ? "Merging…" : (MERGE_LABELS[methods[0] ?? "merge"] ?? "Merge")}
      </Button>
    )
  }

  return (
    <div className="flex items-center shrink-0">
      <Button
        size="sm"
        className="h-5 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-l-md rounded-r-none border-r border-emerald-700 shrink-0"
        disabled={merging}
        onClick={() => handleMerge()}
      >
        {merging ? "Merging…" : (MERGE_LABELS[method ?? "merge"] ?? "Merge")}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            className="h-5 px-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-r-md rounded-l-none shrink-0"
            disabled={merging}
          >
            <IconChevronDown size={10} />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-44 p-1">
          {methods.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMethod(m)
                setOpen(false)
              }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-[12px] rounded transition-colors",
                m === method
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {MERGE_LABELS[m]}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}
