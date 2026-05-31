import type { FileRow, InProgressRow, Length, ShippedRow } from "../wrapped.types.js"

export const LENGTH_INSTRUCTIONS: Record<Length, string> = {
  short: "Write a single tight paragraph (3–5 sentences). Mention only the 1–2 biggest themes and name the repo(s) involved. Skip minor work.",
  medium: "Write 2–3 short paragraphs. Group related work thematically and name the repo for each change. Cover the main themes; minor work can be mentioned briefly.",
  long: "Write 4–6 paragraphs. Cover every significant piece of work, grouped by repo or theme. Include specific file paths or code areas where they help paint the picture. Still prose, not a list.",
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3600_000).toFixed(1)}h`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export function shippedLine(a: ShippedRow): string {
  const repo = a.repoName ?? "unknown repo"
  const desc = a.description ? ` — ${a.description.slice(0, 140)}` : ""
  const churn = Number(a.fileCount) > 0 ? ` [${a.fileCount} files, +${Number(a.additions)}/-${Number(a.deletions)}]` : ""
  const statusTag = a.status === "in-review" ? " (in review)" : ""
  return `- [${repo}] ${a.title}${statusTag}${desc}${churn}`
}

export function formatShipped(rows: ShippedRow[]): string {
  if (rows.length === 0) return "- (nothing shipped yet)"
  return rows.map(shippedLine).join("\n")
}

export function formatInProgress(rows: InProgressRow[]): string {
  if (rows.length === 0) return "- (none)"
  return rows.map((a) => `- [${a.repoName ?? "unknown repo"}] ${a.title}`).join("\n")
}

export function formatTopFiles(rows: FileRow[]): string {
  if (rows.length === 0) return "- (no file changes tracked)"
  return rows.map((f) => `- [${f.repoName ?? "unknown repo"}] ${f.path} (+/-${Number(f.total)} lines)`).join("\n")
}
