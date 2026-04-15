import { useState, useEffect } from "react"
import { IconX, IconDownload, IconClock, IconCheck } from "@tabler/icons-react"

interface UpdateBannerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any
  isInstalling: boolean
  progress: number | null
  isIdle: boolean
  needsManualRestart?: boolean
  onInstall: () => void
}

export function UpdateBanner({ update, isInstalling, progress, isIdle, needsManualRestart, onInstall }: UpdateBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [pendingIdle, setPendingIdle] = useState(false)

  // When "restart when idle" is pending and app becomes idle, install
  useEffect(() => {
    if (pendingIdle && isIdle) {
      onInstall()
    }
  }, [pendingIdle, isIdle, onInstall])

  if (dismissed) return null

  return (
    <div data-tauri-drag-region className="flex items-center gap-3 px-4 py-2 bg-primary text-primary-foreground text-[12px] shrink-0">
      <IconDownload size={13} className="shrink-0" />

      {needsManualRestart ? (
        <>
          <IconCheck size={13} className="shrink-0" />
          <span className="flex-1 min-w-0">
            Update installed. Quit and reopen Huxflux to finish updating.
          </span>
          <button
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="shrink-0 text-primary-foreground/60 hover:text-primary-foreground transition-colors"
          >
            <IconX size={13} />
          </button>
        </>
      ) : isInstalling ? (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="shrink-0">
            {progress === 100 ? "Restarting…" : `Downloading update… ${progress ?? 0}%`}
          </span>
          <div className="flex-1 h-1 rounded-full bg-primary-foreground/20 overflow-hidden">
            <div
              className="h-full bg-primary-foreground rounded-full transition-all duration-300"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
        </div>
      ) : pendingIdle ? (
        <>
          <span className="flex-1 min-w-0 flex items-center gap-1.5">
            <IconClock size={12} className="shrink-0" />
            Waiting for agents to finish, then restarting…
          </span>
          <button
            onClick={() => setPendingIdle(false)}
            className="shrink-0 px-2.5 py-0.5 rounded-md bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            aria-label="Dismiss update banner"
            onClick={() => setDismissed(true)}
            className="shrink-0 text-primary-foreground/60 hover:text-primary-foreground transition-colors"
          >
            <IconX size={13} />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 min-w-0">
            Update available: <strong>{update.version}</strong>
          </span>
          <button
            onClick={onInstall}
            className="shrink-0 px-2.5 py-0.5 rounded-md bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors font-medium"
          >
            Install &amp; Restart
          </button>
          {!isIdle && (
            <button
              onClick={() => setPendingIdle(true)}
              className="shrink-0 px-2.5 py-0.5 rounded-md bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
              title="Restart automatically when no agents are running"
            >
              Restart when idle
            </button>
          )}
          <button
            aria-label="Dismiss update banner"
            onClick={() => setDismissed(true)}
            className="shrink-0 text-primary-foreground/60 hover:text-primary-foreground transition-colors"
          >
            <IconX size={13} />
          </button>
        </>
      )}
    </div>
  )
}
