// Particles are decorative and static — generated once at module load so the
// component is pure (no `Math.random()` calls inside render or useMemo).
const PARTICLES = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 4 + 1.5,
  duration: Math.random() * 18 + 10,
  delay: Math.random() * -20,
  opacity: Math.random() * 0.35 + 0.1,
  // blue → violet → teal hue range
  hue: Math.random() * 80 + 200,
}))

/** 40 floating, glowing particles drifting across the viewport. Pure decoration. */
export function Particles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            background: `hsl(${p.hue}, 70%, 60%)`,
            boxShadow: `0 0 ${p.size * 4}px hsl(${p.hue}, 80%, 65%), 0 0 ${p.size * 8}px hsl(${p.hue}, 70%, 60%)`,
            animation: `homeFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
