import { useRef, useState } from "react"
import { cn } from "@huxflux/ui"
import { IconCheck, IconPlayerPlayFilled, IconVolume } from "@tabler/icons-react"
import { SOUNDS, playSound, type SoundId } from "@/lib/sounds"
import { getSoundPref, setSoundPref } from "@/lib/notificationPrefs"

export function Soundboard() {
  const [current, setCurrent] = useState<SoundId>(getSoundPref)
  const [playing, setPlaying] = useState<SoundId | null>(null)
  const playToken = useRef(0)

  const playable = SOUNDS.filter((s) => s.id !== "none")

  function handlePlay(id: SoundId) {
    const token = ++playToken.current
    setPlaying(id)
    playSound(id, () => { if (playToken.current === token) setPlaying(null) })
  }

  function handleSetCurrent(id: SoundId) {
    setCurrent(id)
    setSoundPref(id)
  }

  return (
    <div>
      <p className="text-[13px] text-muted-foreground mb-6 leading-snug">
        Click any sound to preview it.{" "}
        {current === "none"
          ? "No sound is set to play when an agent finishes — pick one below."
          : "The highlighted one plays when an agent finishes."}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {playable.map((s) => {
          const isCurrent = s.id === current
          const isPlaying = s.id === playing
          return (
            <div
              key={s.id}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-colors",
                isCurrent ? "border-foreground bg-card" : "border-border bg-card hover:border-foreground/40",
              )}
            >
              <button
                type="button"
                aria-label={`Play ${s.label}`}
                onClick={() => handlePlay(s.id)}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                  isPlaying ? "bg-foreground text-background" : "bg-muted text-muted-foreground group-hover:text-foreground",
                )}
              >
                {isPlaying ? <IconVolume size={20} /> : <IconPlayerPlayFilled size={18} />}
              </button>
              <span className="text-[13px] font-medium text-foreground">{s.label}</span>
              <button
                type="button"
                onClick={() => handleSetCurrent(s.id)}
                disabled={isCurrent}
                className={cn(
                  "flex items-center gap-1 text-[11px] transition-colors",
                  isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100",
                )}
              >
                {isCurrent ? (
                  <>
                    <IconCheck size={12} /> Current
                  </>
                ) : (
                  "Set as default"
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
