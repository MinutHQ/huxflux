import type { CSSProperties } from "react"

const sparks = [
  { speed: "2.6s", reverse: false, radius: 9, size: 2.6, delay: "0s" },
  { speed: "3.7s", reverse: true, radius: 11, size: 2, delay: "-1.2s" },
  { speed: "2s", reverse: false, radius: 8, size: 1.6, delay: "-0.7s" },
]

/** A glowing core that breathes, a ripple going out from it, and three sparks circling it. */
export function WorkOrb() {
  return (
    <div className="relative size-[26px] shrink-0 grid place-items-center" aria-hidden>
      <span className="work-orb-glow absolute size-4 rounded-full" />
      <span className="work-orb-ripple absolute size-2.5 rounded-full" />
      {sparks.map((s, i) => (
        <span
          key={i}
          className="work-orb-spark absolute inset-0"
          style={{
            "--spark-speed": s.speed,
            animationDirection: s.reverse ? "reverse" : "normal",
            animationDelay: s.delay,
          } as CSSProperties}
        >
          <span
            className="absolute rounded-full opacity-70"
            style={{ width: s.size, height: s.size, left: 13 + s.radius - s.size / 2, top: 13 - s.size / 2 }}
          />
        </span>
      ))}
      <span className="work-orb-core relative size-2.5 rounded-full" />
    </div>
  )
}

/** An indeterminate progress line along the bottom of the live step: a bright comet sweeping a faint track. */
export function WorkComet() {
  return (
    <div className="work-comet-track absolute bottom-0 inset-x-3 h-0.5 overflow-hidden rounded-full" aria-hidden>
      <div className="work-comet h-full rounded-full" />
    </div>
  )
}
