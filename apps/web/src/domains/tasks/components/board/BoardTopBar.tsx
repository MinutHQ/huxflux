import { Button, cn } from "@huxflux/ui"
import { IconPlus, IconRefresh } from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys, useHuxfluxMutation } from "@huxflux/shared"

export function BoardTopBar({
  hasSprintData,
  activeSprintOnly,
  onSetActiveSprint,
  onNewTask,
}: {
  hasSprintData: boolean
  activeSprintOnly: boolean
  onSetActiveSprint: (value: boolean) => void
  onNewTask: () => void
}) {
  const queryClient = useQueryClient()

  const syncMut = useHuxfluxMutation<Awaited<ReturnType<typeof api.tasks.sync>>, void>({
    mutationFn: () => api.tasks.sync(),
    onSuccess: async (result) => {
      if ("error" in result) {
        const { toast } = await import("sonner")
        toast.error(result.error)
      } else {
        queryClient.setQueryData(queryKeys.tasks.list(), result)
      }
    },
  })
  const syncing = syncMut.isPending
  const sync = () => syncMut.mutate()

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-border/30">
      {hasSprintData && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onSetActiveSprint(false)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-md transition-colors",
              !activeSprintOnly
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
            )}
          >
            All issues
          </button>
          <button
            onClick={() => onSetActiveSprint(true)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-md transition-colors",
              activeSprintOnly
                ? "bg-accent text-foreground"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
            )}
          >
            Active sprint
          </button>
        </div>
      )}
      <div className="flex-1" />
      <button
        onClick={onNewTask}
        className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
      >
        <IconPlus size={12} />
        New task
      </button>
      <Button
        variant="ghost"
        size="xs"
        onClick={sync}
        disabled={syncing}
        title="Sync from Jira"
      >
        <IconRefresh size={13} className={syncing ? "animate-spin" : ""} />
        Sync
      </Button>
    </div>
  )
}
