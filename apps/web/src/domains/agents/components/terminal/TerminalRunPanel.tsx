import { IconPlayerPlayFilled, IconSettings } from "@tabler/icons-react"

interface TerminalRunPanelProps {
  runScript: string | undefined
  onRun: () => void
  onOpenSettings: () => void
}

/** Overlay shown when the "Run" top tab is selected. Shows either the run button or the settings prompt. */
export function TerminalRunPanel({ runScript, onRun, onOpenSettings }: TerminalRunPanelProps) {
  if (runScript) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-background z-10">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">Run script</p>
          <p className="text-[11px] font-mono text-muted-foreground/60 bg-card border border-border rounded px-2 py-1 max-w-xs truncate">
            {runScript}
          </p>
        </div>
        <button
          onClick={onRun}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
        >
          <IconPlayerPlayFilled size={12} />
          Run
        </button>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-background z-10">
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">No run script configured</p>
        <p className="text-[12px] text-muted-foreground/60">Add a run script to the repository settings</p>
      </div>
      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-accent/60 transition-colors"
      >
        <IconSettings size={13} />
        Open settings
      </button>
    </div>
  )
}
