interface OrbitDotsProps {
  color: string
  size?: number
}

/** Three small dots orbiting a center point. Overlaid on hero card icons on hover. */
export function OrbitDots({ color, size = 40 }: OrbitDotsProps) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 6px ${color}`,
            opacity: 0.6,
            animation: `homeOrbit ${3 + i * 0.5}s linear ${i * -1}s infinite`,
            ["--orbit-r" as string]: `${size / 2 + 4}px`,
          }}
        />
      ))}
    </div>
  )
}
