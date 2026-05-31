export function TypingBubble({ elapsedSeconds }: { elapsedSeconds: number }) {
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")
  const ss = String(elapsedSeconds % 60).padStart(2, "0")
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-muted-foreground/30"
            style={{
              animation: `typingBounce 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
        <span className="text-[11px] font-mono text-muted-foreground/40 tabular-nums ml-0.5">{mm}:{ss}</span>
      </div>
    </div>
  )
}
