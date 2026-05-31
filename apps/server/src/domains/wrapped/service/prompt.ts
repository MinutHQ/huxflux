import type { DateRange, GatheredStats, Length, WrappedStats } from "../wrapped.types.js"
import {
  LENGTH_INSTRUCTIONS,
  formatInProgress,
  formatShipped,
  formatTopFiles,
  formatTokens,
} from "./formatting.js"

/**
 * Pack the gathered DB stats into the JSON-friendly shape that gets cached
 * alongside the generated summary. Mirrors the original `statsForPrompt`
 * literal so the cached `stats_json` rows stay backwards-compatible.
 */
export function buildStatsForPrompt(range: DateRange, stats: GatheredStats): WrappedStats {
  return {
    period: range.label,
    from: range.from,
    to: range.to,
    agents: stats.totalAgents,
    done: stats.doneCount,
    inProgress: stats.inProgressCount,
    inReview: stats.inReviewCount,
    cancelled: stats.statusMap["cancelled"] ?? 0,
    backlog: stats.statusMap["backlog"] ?? 0,
    messages: stats.totalMessages,
    tokens: formatTokens(stats.totalTokens),
    toolCalls: stats.totalToolCalls,
    files: stats.totalFiles,
    additions: stats.additions,
    deletions: stats.deletions,
    avgDuration: stats.avgDuration,
    shipped: stats.shippedAgents.map((a) => a.title),
    inProgressTitles: stats.inProgressAgents.map((a) => a.title),
    topFiles: stats.topFiles.map((f) => f.path),
    repos: stats.reposLabel,
  }
}

export function buildPrompt(statsForPrompt: WrappedStats, stats: GatheredStats, length: Length): string {
  const shippedLines = formatShipped(stats.shippedAgents)
  const inProgressLines = formatInProgress(stats.inProgressAgents)
  const topFileLines = formatTopFiles(stats.topFiles)

  return `You are writing a short narrative recap of the coding work a developer shipped this period. The reader is the developer themselves — they want to see the *substance* of what changed, not raw statistics.

Time period: ${statsForPrompt.period} (${statsForPrompt.from} to ${statsForPrompt.to})
Repos active: ${statsForPrompt.repos}

Each line below is prefixed with [repo-name] so you know which project each change belongs to.

Shipped or in review (${stats.doneCount} shipped, ${stats.inReviewCount} in review):
${shippedLines}

Currently in progress (${stats.inProgressCount}):
${inProgressLines}

Most-touched files (helps you infer themes):
${topFileLines}

Totals for context (use sparingly): ${stats.totalFiles} files touched, +${stats.additions}/-${stats.deletions} lines across ${stats.totalAgents} agents.

Length: ${LENGTH_INSTRUCTIONS[length]}

Narrate what was actually built. Group related work thematically — use the titles, descriptions, and file paths to infer themes (e.g. "auth overhaul", "home-view polish", "database migrations"). **Always name the repo** when you describe a change, so the reader knows where the work landed (e.g. "In huxflux, the notification pipeline got a major speed boost…"). If work spans multiple repos, organize by repo or call out cross-repo efforts explicitly. Lead with the biggest or most interesting changes. Numbers are support, not the story — sprinkle them in, don't lead with them. Warm, first-person-ish tone, like the developer summarizing their week to a teammate. Plain prose only — no bullets, headers, or markdown.`
}
