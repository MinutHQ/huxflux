import { useState } from "react"
import { Button } from "@huxflux/ui"
import { IconCheck, IconX, IconShieldLock } from "@tabler/icons-react"

interface ToolApprovalCardProps {
  toolName: string
  input: unknown
  onDecide: (decision: "allow" | "deny") => Promise<void> | void
}

/**
 * Shown when the agent's permission mode put a tool call to the user. The turn
 * is blocked until a decision is sent, so the card deliberately has no dismiss
 * action: ignoring it would leave the agent stuck with no way back.
 */
export function ToolApprovalCard({ toolName, input, onDecide }: ToolApprovalCardProps) {
  const [deciding, setDeciding] = useState<"allow" | "deny" | null>(null)

  async function decide(decision: "allow" | "deny") {
    if (deciding) return
    setDeciding(decision)
    try {
      await onDecide(decision)
    } finally {
      setDeciding(null)
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/40">
        <IconShieldLock size={14} className="text-muted-foreground shrink-0" />
        <span className="text-[13px] text-foreground">
          Allow <span className="font-semibold">{toolName}</span>?
        </span>
      </div>

      <div className="px-4 py-3">
        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-secondary px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/80">
          <code className="whitespace-pre-wrap break-words">{formatInput(input)}</code>
        </pre>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 pb-3">
        <Button variant="outline" size="sm" disabled={deciding !== null} onClick={() => decide("deny")}>
          <IconX size={13} />
          {deciding === "deny" ? "Denying…" : "Deny"}
        </Button>
        <Button variant="default" size="sm" disabled={deciding !== null} onClick={() => decide("allow")}>
          <IconCheck size={13} />
          {deciding === "allow" ? "Allowing…" : "Allow"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Tool arguments as readable text. The shape is provider-defined and may be a
 * bare string, so fall back rather than assuming an object.
 */
function formatInput(input: unknown): string {
  if (input === null || input === undefined) return "(no arguments)"
  if (typeof input === "string") return input
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}
