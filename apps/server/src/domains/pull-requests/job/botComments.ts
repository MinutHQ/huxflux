/**
 * Review-bot comments that carry nothing for an agent to act on: status stubs
 * ("review running") and all-clear summaries. Matching is on the bots' own
 * markers and wording, so an unrecognised format is treated as actionable and
 * still reaches the agent.
 */

// GraphQL (review threads) returns bot logins without the "[bot]" suffix,
// REST (issue comments) returns them with it.
function botLogin(author: string): string {
  return author.toLowerCase().replace(/\[bot\]$/, "")
}

function isNoOpOplane(body: string): boolean {
  if (body.includes("oplane-bot:in-progress") || body.includes("oplane-bot:max-reviews")) return true
  if (!body.includes("oplane-bot:results")) return false
  // A refresh is running; the comment is edited in place when it completes.
  if (body.includes("**Update in progress**")) return true
  return body.includes("All requirements are satisfied")
    || body.includes("did not identify any security requirements that need attention")
}

function isNoOpCodexSummary(body: string): boolean {
  if (!body.includes("codex-pull-request-review-summary")) return false
  // Findings arrive as their own inline comments; the summary only matters
  // when it reports unresolved findings.
  return !/"has_unresolved_findings"\s*:\s*true/.test(body)
}

function isNoOpCursor(body: string): boolean {
  return /<h3>Bugbot (couldn't run|is paused)/.test(body)
}

export function isNoOpBotComment(author: string, body: string): boolean {
  const login = botLogin(author)
  const text = body.trim()
  switch (login) {
    case "oplane-bot": return isNoOpOplane(text)
    case "chatgpt-codex-connector": return isNoOpCodexSummary(text)
    case "cursor": return isNoOpCursor(text)
    case "linear": return text.startsWith("<!-- linear-linkback -->")
    case "github-actions": return text.startsWith("No new findings.")
    default: return false
  }
}
