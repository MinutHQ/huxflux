import { Button } from "@huxflux/ui"
import { IconX } from "@tabler/icons-react"

export function SshSetupModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-[480px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Remote SSH Setup</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <IconX size={16} />
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Set these environment variables on the server before starting Huxflux:
        </p>
        <pre className="bg-background rounded-lg p-3 text-[11px] font-mono text-foreground mb-4 select-all">
{`export HUXFLUX_SSH_HOST=<server-ip-or-hostname>
export HUXFLUX_SSH_USER=<your-username>
huxflux start`}
        </pre>
        <p className="text-[12px] text-muted-foreground mb-1">
          On your machine, install the <strong>Remote - SSH</strong> extension in VS Code or Cursor.
        </p>
        <p className="text-[12px] text-muted-foreground">
          The server must have SSH enabled and accept key-based authentication from your machine.
        </p>
        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
