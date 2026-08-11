import { ThinkingOrb } from "thinking-orbs"

export function TypingBubble({ elapsedSeconds }: { elapsedSeconds: number }) {
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")
  const ss = String(elapsedSeconds % 60).padStart(2, "0")
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2 px-4 py-3">
        <ThinkingOrb state="working" size={20} />
        <span className="text-[11px] font-mono text-muted-foreground/40 tabular-nums">{mm}:{ss}</span>
      </div>
    </div>
  )
}
