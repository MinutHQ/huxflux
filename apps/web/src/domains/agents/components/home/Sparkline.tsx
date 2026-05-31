interface SparklineProps {
  data: number[]
  color: string
  height?: number
}

/**
 * Tiny inline sparkline used by hero stat cards. Uses a Catmull-Rom-style
 * cubic Bezier through the points and an area gradient fill behind the line.
 * Returns null for runs shorter than 2 points (nothing to draw).
 */
export function Sparkline({ data, color, height = 32 }: SparklineProps) {
  const width = 120
  if (data.length < 2) return null

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }))

  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return null

  let path = `M${first.x},${first.y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(i + 2, points.length - 1)]!
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    path += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }

  const gId = `spark-${color.replace(/[^a-z0-9]/g, "")}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${gId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        className="drop-shadow-md"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
      <circle cx={last.x} cy={last.y} r="5" fill={color} opacity="0.2" style={{ animation: "homeGlow 2s ease-in-out infinite" }} />
      <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
    </svg>
  )
}
