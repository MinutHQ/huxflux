import { useEffect } from "react"
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@huxflux/ui"
import { IconLoader2 } from "@tabler/icons-react"
import { api, queryKeys, useHuxfluxMutation, useHuxfluxQuery } from "@huxflux/shared"
import { toast } from "sonner"

interface HeadroomInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the server reports the CLI installed. */
  onInstalled: () => void
}

const MANUAL_HINT = 'uv tool install --python 3.13 "headroom-ai[all]"'

/**
 * Confirm-and-progress dialog for the unattended `headroom` CLI install.
 * The server picks uv or pipx; we show the exact command, then poll status
 * every 2s while it runs and surface the last log lines.
 */
export function HeadroomInstallDialog({ open, onOpenChange, onInstalled }: HeadroomInstallDialogProps) {
  const { data: status, refetch } = useHuxfluxQuery({
    queryKey: queryKeys.headroom.status(),
    queryFn: api.headroom.status,
    enabled: open,
    refetchInterval: (query) => (query.state.data?.install.state === "running" ? 2_000 : false),
  })
  const install = status?.install
  const running = install?.state === "running"

  const start = useHuxfluxMutation({
    mutationFn: () => api.headroom.install(),
    invalidate: () => queryKeys.headroom.status(),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to start install"),
  })

  useEffect(() => {
    if (open && status?.installed) {
      toast.success("Headroom installed")
      onInstalled()
      onOpenChange(false)
    }
  }, [open, status?.installed, onInstalled, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next) }}>
      <DialogContent className="max-w-[440px] p-5 space-y-3">
        <DialogTitle className="text-[14px] font-medium">Install Headroom</DialogTitle>
        <DialogDescription className="text-[12px] text-muted-foreground">
          Headroom compresses tool output before it reaches the model. Installing runs a Python tool
          installer on the server machine and downloads a few hundred MB of dependencies. It can take
          several minutes the first time.
        </DialogDescription>
        <pre className="rounded-md bg-muted px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-all">
          {install?.command ?? MANUAL_HINT}
        </pre>
        {!status?.canInstall && !running && (
          <div className="text-[12px] text-destructive">
            Neither <code>uv</code> nor <code>pipx</code> is on the server PATH. Install one of them, or run the command above by hand.
          </div>
        )}
        {install?.state === "failed" && install.error && (
          <div className="text-[12px] text-destructive break-words">{install.error}</div>
        )}
        {(running || (install?.log.length ?? 0) > 0) && (
          <pre className="rounded-md bg-muted px-3 py-2 text-[10px] font-mono text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
            {install?.log.slice(-8).join("\n") || "Starting…"}
          </pre>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" disabled={running} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={running || start.isPending || !status?.canInstall}
            onClick={() => { start.mutate(undefined); void refetch() }}
          >
            {running ? (<><IconLoader2 size={13} className="animate-spin" /> Installing…</>) : install?.state === "failed" ? "Retry" : "Install"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
