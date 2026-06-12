import { statusConfig, type AgentStatus } from "@huxflux/shared"

/**
 * Linear-style status glyph: a 14×14 SVG that visually encodes the agent state
 * (filled check, 3/4 pie, half pie, dashed ring, crossed-out fill). Inlined SVG
 * rather than an icon font so each shape can be tinted from `statusConfig.hex`.
 */
export function StatusIcon({ status, size = 14 }: { status: AgentStatus; size?: number }) {
  const color = statusConfig[status].hex
  const cx = 7
  const cy = 7
  const r = 5.6

  switch (status) {
    case "done":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill={color} />
          <path d="M4.2 7.2 L6.2 9.2 L9.8 5.4" stroke="#1c1917" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case "in-review":
      // 3/4 pie inside a ring
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="1.4" />
          <path d={`M ${cx} ${cy} L ${cx} ${cy - r + 0.6} A ${r - 0.6} ${r - 0.6} 0 1 1 ${cx - (r - 0.6)} ${cy} Z`} fill={color} />
        </svg>
      )
    case "draft-pr":
      // 3/4 pie inside a dashed ring — a PR exists but is still a draft
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="1.3" strokeDasharray="1.8 1.6" />
          <path d={`M ${cx} ${cy} L ${cx} ${cy - r + 0.6} A ${r - 0.6} ${r - 0.6} 0 1 1 ${cx - (r - 0.6)} ${cy} Z`} fill={color} />
        </svg>
      )
    case "in-progress":
      // half pie inside a ring
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="1.4" />
          <path d={`M ${cx} ${cy - r + 0.6} A ${r - 0.6} ${r - 0.6} 0 0 1 ${cx} ${cy + r - 0.6} L ${cx} ${cy} Z`} fill={color} />
        </svg>
      )
    case "backlog":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="1.3" strokeDasharray="1.8 1.6" />
        </svg>
      )
    case "cancelled":
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill={color} />
          <path d="M4.6 4.6 L9.4 9.4 M9.4 4.6 L4.6 9.4" stroke="#1c1917" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
  }
}
